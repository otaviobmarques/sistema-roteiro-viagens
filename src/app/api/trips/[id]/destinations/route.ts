import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { addDays } from "@/lib/domain/time";

const Body = z.object({ destinations: z.array(z.object({ id: z.string().uuid(), days: z.number().int().min(1), locked: z.boolean() })) });

/** Ajuste manual da divisão dos dias (RF-242/243): redata os destinos em sequência. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const { data: trip } = await supabase.from("trips").select("start_date, end_date").eq("id", id).single();
  const { data: current } = await supabase.from("trip_destinations").select("id, position").eq("trip_id", id).order("position");
  if (!trip?.start_date || !current) return NextResponse.json({ error: "viagem sem datas" }, { status: 400 });
  const byId = new Map(parsed.data.destinations.map((d) => [d.id, d]));
  let cursor = trip.start_date as string;
  for (const c of current) {
    const d = byId.get(c.id);
    if (!d) continue;
    const { error } = await supabase.from("trip_destinations").update({ days: d.days, locked: d.locked, start_date: cursor, end_date: addDays(cursor, d.days - 1) }).eq("id", c.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    cursor = addDays(cursor, d.days);
  }
  await supabase.from("trips").update({ end_date: addDays(cursor, -1) }).eq("id", id);
  return NextResponse.json({ ok: true, end_date: addDays(cursor, -1) });
}
