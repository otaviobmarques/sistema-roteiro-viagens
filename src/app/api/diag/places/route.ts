import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { geocode, getCandidates, lastFetchInfo } from "@/lib/places";

export const maxDuration = 60;

/** Diagnóstico da base de lugares: quantos candidatos vieram de cada fonte e em quanto tempo. */
export async function GET(req: Request) {
  const { supabase } = await requireUser();
  const city = new URL(req.url).searchParams.get("city") || "Lisboa";
  const t0 = Date.now();
  const g = await geocode(city);
  const t1 = Date.now();
  if (!g) return NextResponse.json({ error: "geocode falhou", ms: t1 - t0 });
  const r = await getCandidates(supabase, g.name, g.lat, g.lng);
  const byType = r.candidates.reduce<Record<string, number>>((a, c) => ({ ...a, [c.type]: (a[c.type] ?? 0) + 1 }), {});
  return NextResponse.json({ city: g.name, geocodeMs: t1 - t0, candidatesMs: Date.now() - t1, source: r.source, total: r.candidates.length, byType, fetch: lastFetchInfo });
}
