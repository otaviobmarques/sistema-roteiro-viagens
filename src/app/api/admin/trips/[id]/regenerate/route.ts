// Suporte: o administrador refaz o roteiro de um cliente sem cobrar crédito.
// Se um destino for um país ou estado inteiro, ele é trocado pelas cidades-base sugeridas pelo Pino.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { geocode } from "@/lib/places";
import { expandRegion } from "@/lib/ai/regions";
import { generateTrip } from "@/lib/ai/itinerary";
import { addDays } from "@/lib/domain/time";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  const { data: trip } = await supabase.from("trips").select("id, owner_id, start_date, title").eq("id", id).maybeSingle();
  if (!trip?.start_date) return NextResponse.json({ error: "Roteiro sem datas." }, { status: 404 });
  const [{ data: dests }, { data: prefs }, { data: must }] = await Promise.all([
    supabase.from("trip_destinations").select("*").eq("trip_id", id).order("position"),
    supabase.from("trip_preferences").select("*").eq("trip_id", id).maybeSingle(),
    supabase.from("trip_must_haves").select("original_text").eq("trip_id", id),
  ]);
  if (!dests?.length) return NextResponse.json({ error: "Roteiro sem destinos." }, { status: 400 });

  // 1) troca país/estado pelas cidades-base
  const next: { city: string; country: string | null; lat: number; lng: number; days: number; locked: boolean }[] = [];
  const changed: string[] = [];
  for (const d of dests) {
    const g = await geocode(d.country && d.country !== d.city ? `${d.city}, ${d.country}` : d.city);
    if (g?.region) {
      const { cities } = await expandRegion({
        region: d.city, country: d.country, kind: g.region, days: d.days ?? 1, profile: prefs?.travel_profile ?? "classica",
        pace: "equilibrado", interests: (prefs?.interests as Record<string, number>) ?? {}, occasion: prefs?.occasion, notes: prefs?.notes,
        mustHaves: (must ?? []).map((m) => m.original_text),
      });
      const found: typeof next = [];
      for (const c of cities) {
        const cg = await geocode(`${c.city}, ${d.country ?? d.city}`);
        if (cg && !cg.region && !found.some((x) => x.city === (c.city.trim() || cg.name))) found.push({ city: c.city.trim() || cg.name, country: cg.country ?? d.country, lat: cg.lat, lng: cg.lng, days: c.days, locked: false });
      }
      if (found.length) {
        // mantém o total de dias do destino original
        const diff = (d.days ?? 1) - found.reduce((s, x) => s + x.days, 0);
        found[0].days = Math.max(1, found[0].days + diff);
        next.push(...found);
        changed.push(`${d.city} → ${found.map((x) => `${x.city} (${x.days})`).join(", ")}`);
        continue;
      }
    }
    next.push({ city: d.city, country: d.country, lat: d.lat, lng: d.lng, days: d.days ?? 1, locked: !!d.locked });
  }
  if (changed.length) {
    let cursor = trip.start_date as string;
    const rows = next.map((d, i) => {
      const r = { trip_id: id, ...d, start_date: cursor, end_date: addDays(cursor, d.days - 1), position: i };
      cursor = addDays(cursor, d.days);
      return r;
    });
    const { error: delErr } = await supabase.from("trip_destinations").delete().eq("trip_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await supabase.from("trip_destinations").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 2) gera de novo (sem cobrar): registra como ajuste feito pelo suporte
  const { data: gen } = await supabase.from("ai_generations").insert({ user_id: user.id, trip_id: id, kind: "ajuste", status: "iniciada", input: { suporte: true, trocas: changed } }).select("id").single();
  try {
    const r = await generateTrip(supabase, id, trip.owner_id);
    await supabase.from("ai_generations").update({
      status: "concluida", score: r.viability, output: { suporte: true, trocas: changed, tips: r.tips },
      input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, cost_ai_cents: r.usage.costCents, cost_total_cents: r.usage.costCents, duration_ms: r.durationMs,
    }).eq("id", gen!.id);
    await supabase.from("audit_log").insert({ actor_id: user.id, action: "refazer_roteiro", target: id, details: { trocas: changed, viabilidade: r.viability } });
    return NextResponse.json({ ok: true, changed, viability: r.viability });
  } catch (e) {
    await supabase.from("ai_generations").update({ status: "falhou", error: (e as Error).message }).eq("id", gen!.id);
    return NextResponse.json({ error: `Não consegui refazer: ${(e as Error).message}` }, { status: 500 });
  }
}
