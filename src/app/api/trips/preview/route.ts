import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { geocode, getCandidates } from "@/lib/places";
import { orderDestinations, allocateDays, transferLegs } from "@/lib/domain/multidest";
import { addDays, daysBetween } from "@/lib/domain/time";
import { previewHighlights } from "@/lib/ai/itinerary";
import { AIUnavailableError, aiConfigured } from "@/lib/ai/claude";
import { expandRegion } from "@/lib/ai/regions";
import type { Geo } from "@/lib/places";
import type { TravelProfile } from "@/lib/domain/score";

export const maxDuration = 120;

const Body = z.object({
  tripId: z.string().uuid().optional(),
  destinations: z.array(z.string().min(2)).min(1).max(8),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arrival: z.string().optional().nullable(),
  departure: z.string().optional().nullable(),
  origin_city: z.string().optional().nullable(),
  adults: z.number().int().min(1).max(30),
  children: z.number().int().min(0).max(20),
  children_ages: z.array(z.number().int().min(0).max(17)).default([]),
  profile: z.enum(["mochilao", "classica", "experiencia"]),
  pace: z.enum(["leve", "equilibrado", "intenso"]),
  interests: z.record(z.string(), z.number().int().min(1).max(3)),
  must_haves: z.array(z.string().min(2)).max(15).default([]),
  occasion: z.string().optional().nullable(),
  budget_cap_cents: z.number().int().positive().optional().nullable(),
  notes: z.string().max(800).optional().nullable(),
  locked: z.record(z.string(), z.number().int().min(1)).optional(),
});

/** Prévia grátis (RF-230, RN-16): ordem dos destinos, divisão dos dias e destaques. Não usa APIs pagas. */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") }, { status: 400 });
  const b = parsed.data;
  const totalDays = daysBetween(b.start_date, b.end_date) + 1;
  if (totalDays < 1 || totalDays > 60) return NextResponse.json({ error: "A viagem precisa ter entre 1 e 60 dias." }, { status: 400 });
  if (totalDays < b.destinations.length) return NextResponse.json({ error: `São ${b.destinations.length} destinos para ${totalDays} dia(s). Aumente as datas ou tire um destino.` }, { status: 400 });

  // quem tem crédito na carteira não fica preso no limite diário de prévias grátis
  const [{ data: left }, { data: wallet }] = await Promise.all([
    supabase.rpc("previews_left"),
    supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
  ]);
  if (aiConfigured() && (left ?? 0) <= 0 && (wallet?.balance ?? 0) <= 0) return NextResponse.json({ error: "Você usou as 3 prévias grátis de hoje. Volte amanhã ou compre um crédito na Carteira para seguir agora." }, { status: 429 });

  // Geocodifica (base aberta) e verifica cada destino
  const found = await Promise.all(b.destinations.map((d) => geocode(d)));
  const missing = b.destinations.filter((_, i) => !found[i]);
  if (missing.length) return NextResponse.json({ error: `Não encontrei: ${missing.join(", ")}. Confira a grafia.` }, { status: 422 });

  // País ou estado inteiro ("França", "Toscana"): o Pino troca pelas cidades-base certas (nunca o centro do mapa)
  const geos: Geo[] = [];
  const regionDays = new Map<string, number>(); // cidade -> dias sugeridos pelo Pino
  let regionNote: string | null = null;
  const expandedFrom: string[] = [];
  for (const g of found as Geo[]) {
    if (!g.region || !aiConfigured()) { geos.push(g); continue; }
    const share = found.length === 1 ? totalDays : Math.max(2, Math.round(totalDays / found.length));
    try {
      const { cities } = await expandRegion({
        region: g.name, country: g.country, kind: g.region, days: share, profile: b.profile, pace: b.pace, interests: b.interests,
        occasion: b.occasion, notes: b.notes, arrival: b.arrival, departure: b.departure, mustHaves: b.must_haves,
      });
      const cityGeos: Geo[] = [];
      for (const c of cities) {
        const cg = await geocode(`${c.city}, ${g.country ?? g.name}`);
        if (cg && !cg.region && !geos.some((x) => x.name === cg.name) && !cityGeos.some((x) => x.name === cg.name)) {
          cityGeos.push(cg);
          regionDays.set(cg.name, c.days);
        }
      }
      if (cityGeos.length) { geos.push(...cityGeos); expandedFrom.push(g.name); } else geos.push(g);
    } catch {
      geos.push(g);
    }
  }
  if (expandedFrom.length) regionNote = `${expandedFrom.join(" e ")} ${expandedFrom.length > 1 ? "são destinos grandes" : "é um destino grande"}: dividi a viagem nas cidades que mais combinam com você. Ajuste os dias ou troque se quiser.`;
  if (geos.length > 8) geos.splice(8);
  if (totalDays < geos.length) geos.splice(totalDays);
  const [arr, dep] = await Promise.all([b.arrival ? geocode(b.arrival) : null, b.departure ? geocode(b.departure) : null]);

  // Candidatos da base própria → peso de cada destino (quantos lugares combinam com os interesses)
  const candSets = await Promise.all(geos.map((g) => getCandidates(supabase, g!.name, g!.lat, g!.lng, { country: g!.country }).catch(() => ({ candidates: [], source: "none" as const }))));
  const dests = geos.map((g, i) => {
    const cands = candSets[i].candidates.filter((c) => c.type === "atracao" || c.type === "experiencia");
    const weightFromInterests = cands.reduce((s, c) => s + (c.interest ? (b.interests[c.interest] ?? 0) : 0) + c.notability / 10, 0);
    return {
      id: String(i),
      city: g!.name,
      country: g!.country,
      lat: g!.lat,
      lng: g!.lng,
      capital: g!.capital,
      weight: regionDays.has(g!.name) ? regionDays.get(g!.name)! : cands.length ? Math.max(1, Math.sqrt(weightFromInterests)) : g!.capital ? 3 : 1.5,
      locked: b.locked?.[g!.name] != null,
      days: b.locked?.[g!.name],
    };
  });
  const ordered = dests.length > 1 ? orderDestinations(dests, arr ?? null, dep ?? null) : dests;
  const allocated = allocateDays(ordered, totalDays);
  const legs = transferLegs(allocated);

  // Grava a viagem como rascunho (ou atualiza a existente)
  const title = found.length === 1 && expandedFrom.length === 1 ? expandedFrom[0] : allocated.length === 1 ? allocated[0].city : allocated.length <= 3 ? allocated.map((d) => d.city).join(", ").replace(/, ([^,]*)$/, " e $1") : `${allocated[0].country ?? allocated[0].city} em ${totalDays} dias`;
  let tripId = b.tripId;
  if (tripId) {
    const { error } = await supabase.from("trips").update({ start_date: b.start_date, end_date: b.end_date, travelers_adults: b.adults, travelers_children: b.children, children_ages: b.children_ages, pace: b.pace, origin_city: b.origin_city ?? null }).eq("id", tripId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    await supabase.from("trip_destinations").delete().eq("trip_id", tripId);
    await supabase.from("trip_must_haves").delete().eq("trip_id", tripId);
  } else {
    const { data: t, error } = await supabase.from("trips").insert({
      owner_id: user.id, title, status: "rascunho", start_date: b.start_date, end_date: b.end_date, travelers_adults: b.adults, travelers_children: b.children,
      children_ages: b.children_ages, pace: b.pace, origin_city: b.origin_city ?? null, budget_cents: b.budget_cap_cents ?? null,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    tripId = t.id;
  }
  await supabase.from("trip_preferences").upsert({ trip_id: tripId, travel_profile: b.profile, interests: b.interests, occasion: b.occasion ?? null, budget_cap_cents: b.budget_cap_cents ?? null, notes: b.notes ?? null });
  let cursor = b.start_date;
  await supabase.from("trip_destinations").insert(allocated.map((d, i) => {
    const row = { trip_id: tripId, city: d.city, country: d.country, lat: d.lat, lng: d.lng, start_date: cursor, end_date: addDays(cursor, (d.days ?? 1) - 1), days: d.days, locked: !!d.locked, position: i };
    cursor = addDays(cursor, d.days ?? 1);
    return row;
  }));
  if (b.must_haves.length) await supabase.from("trip_must_haves").insert(b.must_haves.map((m) => ({ trip_id: tripId, original_text: m })));

  // Destaques por IA (barato, sem APIs pagas). Sem IA configurada, a prévia sai só com a divisão.
  let ai: Awaited<ReturnType<typeof previewHighlights>>["data"] | null = null;
  let aiError: string | null = null;
  const started = Date.now();
  try {
    const r = await previewHighlights(
      { profile: b.profile as TravelProfile, pace: b.pace, interests: b.interests, adults: b.adults, children: b.children, childrenAges: b.children_ages, occasion: b.occasion ?? null, notes: b.notes ?? null, mustHaves: b.must_haves, budgetCapCents: b.budget_cap_cents ?? null, restrictions: {} },
      allocated.map((d, i) => ({ city: d.city, country: d.country ?? null, days: d.days ?? 1, candidates: candSets[dests.findIndex((x) => x.city === d.city)]?.candidates ?? candSets[i].candidates })),
    );
    ai = r.data;
    await supabase.from("ai_generations").insert({ user_id: user.id, trip_id: tripId, kind: "previa", status: "concluida", input: b, output: r.data, input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, cost_ai_cents: r.usage.costCents, cost_total_cents: r.usage.costCents, duration_ms: Date.now() - started });
  } catch (e) {
    aiError = e instanceof AIUnavailableError ? "A IA ainda não foi configurada: a prévia mostra só a divisão dos dias." : (e as Error).message;
  }
  await supabase.from("trips").update({ title }).eq("id", tripId).eq("status", "rascunho");

  return NextResponse.json({
    tripId,
    totalDays,
    destinations: allocated.map((d) => ({ city: d.city, country: d.country, days: d.days, locked: !!d.locked, lat: d.lat, lng: d.lng, places: candSets[dests.findIndex((x) => x.city === d.city)]?.candidates.length ?? 0 })),
    legs,
    ai,
    aiError,
    regionNote,
  });
}
