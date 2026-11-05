import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { geocode, getCandidates } from "@/lib/places";

export const maxDuration = 60;

// Busca de lugares da base própria (RF-040): geocodifica a cidade e devolve os candidatos do OSM/Wikidata.
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login necessário" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ error: "Digite uma cidade." }, { status: 400 });
  const geo = await geocode(q);
  if (!geo) return NextResponse.json({ error: "Não encontrei essa cidade. Tente com o país, ex.: Porto, Portugal." }, { status: 404 });
  const { candidates, source } = await getCandidates(supabase, geo.name, geo.lat, geo.lng);
  return NextResponse.json({
    city: geo.name,
    country: geo.country,
    center: { lat: geo.lat, lng: geo.lng },
    source,
    places: candidates
      .sort((a, b) => b.notability - a.notability)
      .map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, category: c.category, interest: c.interest, type: c.type, price_level: c.price_level, opening_hours: c.opening_hours, notability: c.notability, website: c.website, wikidata: c.wikidata })),
  });
}
