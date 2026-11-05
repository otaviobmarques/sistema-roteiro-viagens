import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import type { Item } from "@/lib/types";

type Place = { id: string; name: string; lat: number; lng: number; category: string; interest: string | null; opening_hours: string | null; outdoor: boolean } | null;
type Action = { type: "add" | "remove" | "move" | "update"; label: string; item_id: string | null; day_id: string | null; position: number | null; title: string | null; kind: Item["kind"] | null; duration_min: number | null; fixed_time: string | null; place: Place };

/**
 * Aplica ações confirmadas do Pino, guardando uma foto dos dias afetados para desfazer por 15 minutos (RN-03).
 * POST { actions } → { changeId }   ·   DELETE { changeId } → desfaz
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { actions } = (await req.json()) as { actions: Action[] };
  if (!Array.isArray(actions) || !actions.length || actions.length > 10) return NextResponse.json({ error: "nada para aplicar" }, { status: 400 });

  const { data: items } = await supabase.from("itinerary_items").select("*").eq("trip_id", id);
  const byId = new Map((items ?? []).map((i) => [i.id, i as Item]));
  const affected = new Set<string>();
  actions.forEach((a) => { if (a.day_id) affected.add(a.day_id); if (a.item_id && byId.get(a.item_id)?.day_id) affected.add(byId.get(a.item_id)!.day_id!); });
  const snapshot = (items ?? []).filter((i) => i.day_id && affected.has(i.day_id));
  const { data: change, error: chErr } = await supabase.from("item_changes").insert({ trip_id: id, user_id: user.id, source: "pino", description: actions.map((a) => a.label).join("; "), snapshot: { days: [...affected], items: snapshot } }).select("id").single();
  if (chErr) return NextResponse.json({ error: "Sem permissão para editar esta viagem." }, { status: 403 });

  for (const a of actions) {
    const it = a.item_id ? byId.get(a.item_id) : undefined;
    if (a.type === "remove" && it && !it.must_have && !it.anchor) await supabase.from("itinerary_items").delete().eq("id", it.id);
    if (a.type === "move" && it && !it.anchor && !it.must_have && a.day_id) {
      await supabase.from("itinerary_items").update({ day_id: a.day_id, position: a.position ?? 999 }).eq("id", it.id);
    }
    if (a.type === "update" && it) {
      const patch: Partial<Item> = {};
      if (a.place) Object.assign(patch, { title: a.place.name, place_id: a.place.id, lat: a.place.lat, lng: a.place.lng, category: a.place.category, interest_category: a.place.interest, opening_hours: a.place.opening_hours, outdoor: a.place.outdoor, verified: true });
      else if (a.title) patch.title = a.title;
      if (a.duration_min) patch.duration_min = a.duration_min;
      if (a.fixed_time) { patch.anchor = true; patch.anchor_time = a.fixed_time; }
      if (a.kind) patch.kind = a.kind;
      await supabase.from("itinerary_items").update(patch).eq("id", it.id);
    }
    if (a.type === "add" && a.day_id) {
      await supabase.from("itinerary_items").insert({
        trip_id: id, day_id: a.day_id, position: a.position ?? 999, kind: a.kind ?? "lugar", title: a.place?.name ?? a.title ?? "Novo item",
        place_id: a.place?.id ?? null, lat: a.place?.lat ?? null, lng: a.place?.lng ?? null, category: a.place?.category ?? null, interest_category: a.place?.interest ?? null,
        opening_hours: a.place?.opening_hours ?? null, outdoor: a.place?.outdoor ?? false, duration_min: a.duration_min ?? 60,
        anchor: !!a.fixed_time, anchor_time: a.fixed_time, verified: !!a.place, why: `Sugerido pelo Pino: ${a.label}`, created_by: user.id,
      });
    }
  }
  // Renumera posições dos dias afetados
  for (const d of affected) {
    const { data: list } = await supabase.from("itinerary_items").select("id, position").eq("day_id", d).order("position");
    await Promise.all((list ?? []).map((x, idx) => supabase.from("itinerary_items").update({ position: idx }).eq("id", x.id)));
  }
  await supabase.from("activity_log").insert({ trip_id: id, user_id: user.id, action: `aplicou sugestão do Pino: ${actions.map((a) => a.label).join("; ")}`.slice(0, 300) });
  return NextResponse.json({ changeId: change!.id });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { changeId } = await req.json();
  const { data: ch } = await supabase.from("item_changes").select("*").eq("id", changeId).eq("trip_id", id).maybeSingle();
  if (!ch) return NextResponse.json({ error: "alteração não encontrada" }, { status: 404 });
  if (Date.now() - Date.parse(ch.created_at) > 15 * 60 * 1000) return NextResponse.json({ error: "O prazo de 15 minutos para desfazer acabou." }, { status: 410 });
  const snap = ch.snapshot as { days: string[]; items: Item[] };
  for (const d of snap.days) await supabase.from("itinerary_items").delete().eq("day_id", d);
  if (snap.items.length) {
    const rows = snap.items.map(({ updated_at: _u, ...rest }) => rest);
    const { error } = await supabase.from("itinerary_items").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await supabase.from("item_changes").delete().eq("id", changeId);
  return NextResponse.json({ ok: true });
}
