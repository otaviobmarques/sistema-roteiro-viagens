import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { geocode, getCandidates, lastFetchInfo } from "@/lib/places";

export const maxDuration = 60;

/** Diagnóstico da base de lugares: quantos candidatos vieram de cada fonte e em quanto tempo. */
export async function GET(req: Request) {
  const { supabase } = await requireUser();
  const url = new URL(req.url);
  const city = url.searchParams.get("city") || "Lisboa";
  if (url.searchParams.get("probe")) {
    const q = '[out:json][timeout:10];node["tourism"="museum"](around:1500,38.7139,-9.1394);out 3;';
    const mirrors = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.osm.jp/api/interpreter"];
    const out = await Promise.all(mirrors.map(async (m) => {
      const t = Date.now();
      try {
        const r = await fetch(m, { method: "POST", body: new URLSearchParams({ data: q }).toString(), headers: { "User-Agent": "Rotta365/1.0", "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000) });
        const txt = await r.text();
        return { m, status: r.status, ms: Date.now() - t, sample: txt.slice(0, 120) };
      } catch (e) { return { m, error: (e as Error).message, ms: Date.now() - t }; }
    }));
    return NextResponse.json(out);
  }
  const t0 = Date.now();
  const g = await geocode(city);
  const t1 = Date.now();
  if (!g) return NextResponse.json({ error: "geocode falhou", ms: t1 - t0 });
  const r = await getCandidates(supabase, g.name, g.lat, g.lng, { country: g.country });
  const byType = r.candidates.reduce<Record<string, number>>((a, c) => ({ ...a, [c.type]: (a[c.type] ?? 0) + 1 }), {});
  return NextResponse.json({ city: g.name, geocodeMs: t1 - t0, candidatesMs: Date.now() - t1, source: r.source, total: r.candidates.length, byType, fetch: lastFetchInfo });
}
