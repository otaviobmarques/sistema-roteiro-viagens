// Base própria de lugares (seção 10.6): OpenStreetMap (Overpass) + Wikidata, guardados na tabela places.
// Nada do Google é usado/guardado aqui.
import type { SupabaseClient } from "@supabase/supabase-js";

const UA = "Rotta365/1.0 (roteiros de viagem)";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

export type Candidate = {
  id: string; // uuid em places
  osm_id: string | null;
  name: string;
  lat: number;
  lng: number;
  category: string; // museu, mirante, restaurante...
  interest: string | null; // categoria de interesse (score.ts)
  type: "hospedagem" | "restaurante" | "atracao" | "experiencia";
  price_level: number | null; // 1..3
  opening_hours: string | null;
  outdoor: boolean;
  notability: number; // 0..10 (proxy de qualidade da base própria)
  wikidata: string | null;
  website: string | null;
  city: string;
};

export let lastFetchInfo: Record<string, unknown> = {};

export type Geo = { name: string; country: string | null; lat: number; lng: number; capital: boolean; bbox?: number[] };

async function fetchJSON(url: string, init: RequestInit = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 60)}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function geocode(q: string): Promise<Geo | null> {
  await nominatimSlot();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=pt-BR&addressdetails=1&extratags=1`;
  try {
    const data = await fetchJSON(url, {}, 12000);
    const r = data?.[0];
    if (!r) return null;
    const capital = r.extratags?.capital === "yes" || r.extratags?.capital === "2" || Number(r.importance) > 0.75;
    return {
      name: r.name || q,
      country: r.address?.country ?? null,
      lat: Number(r.lat),
      lng: Number(r.lon),
      capital,
      bbox: r.boundingbox?.map(Number),
    };
  } catch {
    return null;
  }
}

function classify(tags: Record<string, string>): Pick<Candidate, "category" | "interest" | "type" | "price_level" | "outdoor"> | null {
  const t = tags;
  const priceFromStars = (s?: string) => (s ? (Number(s) >= 5 ? 3 : Number(s) >= 3 ? 2 : 1) : null);
  if (t.tourism === "hostel") return { category: "hostel", interest: null, type: "hospedagem", price_level: 1, outdoor: false };
  if (t.tourism === "guest_house") return { category: "pousada", interest: null, type: "hospedagem", price_level: 1, outdoor: false };
  if (t.tourism === "hotel") return { category: "hotel", interest: null, type: "hospedagem", price_level: priceFromStars(t.stars) ?? 2, outdoor: false };
  if (t.tourism === "apartment") return { category: "apartamento", interest: null, type: "hospedagem", price_level: 2, outdoor: false };
  if (t.amenity === "restaurant") {
    const fine = /fine|gourmet|michelin/i.test(t.cuisine || "") || t["michelin:stars"] || t.stars;
    return { category: "restaurante", interest: "gastronomia", type: "restaurante", price_level: fine ? 3 : 2, outdoor: false };
  }
  if (t.amenity === "cafe") return { category: "café", interest: "gastronomia", type: "restaurante", price_level: 1, outdoor: false };
  if (t.amenity === "fast_food" || t.amenity === "food_court") return { category: "comida rápida", interest: "gastronomia", type: "restaurante", price_level: 1, outdoor: false };
  if (t.amenity === "marketplace") return { category: "mercado", interest: "local", type: "atracao", price_level: 1, outdoor: false };
  if (t.amenity === "bar" || t.amenity === "pub") return { category: "bar", interest: "noite", type: "restaurante", price_level: 2, outdoor: false };
  if (t.amenity === "theatre" || t.amenity === "arts_centre") return { category: "teatro", interest: "arte", type: "atracao", price_level: 2, outdoor: false };
  if (t.tourism === "museum") return { category: "museu", interest: "cultura", type: "atracao", price_level: 2, outdoor: false };
  if (t.tourism === "gallery") return { category: "galeria", interest: "arte", type: "atracao", price_level: 1, outdoor: false };
  if (t.tourism === "viewpoint") return { category: "mirante", interest: "fotografia", type: "atracao", price_level: 1, outdoor: true };
  if (t.tourism === "zoo" || t.tourism === "aquarium") return { category: t.tourism === "zoo" ? "zoológico" : "aquário", interest: "natureza", type: "atracao", price_level: 2, outdoor: t.tourism === "zoo" };
  if (t.tourism === "theme_park") return { category: "parque temático", interest: "natureza", type: "atracao", price_level: 3, outdoor: true };
  if (t.historic === "castle" || t.historic === "fort") return { category: "castelo", interest: "cultura", type: "atracao", price_level: 2, outdoor: true };
  if (t.historic === "monument" || t.historic === "memorial" || t.historic === "ruins" || t.historic === "archaeological_site") return { category: "monumento", interest: "cultura", type: "atracao", price_level: 1, outdoor: true };
  if (t.amenity === "place_of_worship" && (t.wikidata || t.heritage)) return { category: "igreja", interest: "cultura", type: "atracao", price_level: 1, outdoor: false };
  if (t.leisure === "park" || t.leisure === "garden") return { category: t.leisure === "garden" ? "jardim" : "parque", interest: "natureza", type: "atracao", price_level: 1, outdoor: true };
  if (t.natural === "beach" || t.leisure === "beach_resort") return { category: "praia", interest: "praia", type: "atracao", price_level: 1, outdoor: true };
  if (t.leisure === "spa" || t.amenity === "spa") return { category: "spa", interest: "bem_estar", type: "experiencia", price_level: 3, outdoor: false };
  if (t.shop === "mall" || t.shop === "department_store") return { category: "shopping", interest: "compras", type: "atracao", price_level: 2, outdoor: false };
  if (t.tourism === "attraction") return { category: "atração", interest: "cultura", type: "atracao", price_level: 2, outdoor: true };
  return null;
}

function notability(tags: Record<string, string>): number {
  let n = 3;
  if (tags.wikidata) n += 3;
  if (tags.wikipedia) n += 1.5;
  if (tags.heritage || tags["heritage:operator"]) n += 1;
  if (tags.opening_hours) n += 0.5;
  if (tags.website || tags["contact:website"]) n += 0.5;
  if (tags.stars) n += 0.5;
  return Math.min(10, n);
}

function overpassQueries(lat: number, lng: number, radius: number) {
  const r = Math.min(radius, 6000);
  const head = "[out:json][timeout:15];";
  return {
    atracoes: `${head}(
  nwr["tourism"~"^(museum|gallery|viewpoint|zoo|aquarium|theme_park|attraction)$"]["name"](around:${r},${lat},${lng});
  nwr["historic"~"^(castle|fort|monument|memorial|ruins|archaeological_site)$"]["name"]["wikidata"](around:${r},${lat},${lng});
  nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"](around:${r},${lat},${lng});
  nwr["natural"="beach"]["name"](around:${r * 2},${lat},${lng});
  nwr["amenity"~"^(theatre|arts_centre|marketplace)$"]["name"](around:${r},${lat},${lng});
);out center tags 300;`,
    comida: `${head}nwr["amenity"~"^(restaurant|cafe|bar)$"]["name"]["opening_hours"](around:1500,${lat},${lng});out center tags 150;`,
    hospedagem: `${head}nwr["tourism"~"^(hotel|hostel|guest_house)$"]["name"](around:2500,${lat},${lng});out center tags 80;`,
  };
}

type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };

async function overpassOne(query: string, ms: number): Promise<OsmElement[]> {
  const body = new URLSearchParams({ data: query }).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await Promise.any(
      OVERPASS.map(async (url) => {
        const res = await fetch(url, { method: "POST", body, signal: ctrl.signal, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!Array.isArray(data.elements)) throw new Error("sem dados");
        return data.elements as OsmElement[];
      }),
    );
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

/** Três consultas leves em paralelo (atrações, comida, hospedagem), cada uma nos espelhos do Overpass. */
async function fromOverpass(lat: number, lng: number, radius: number) {
  const q = overpassQueries(lat, lng, radius);
  const parts = await Promise.allSettled([overpassOne(q.atracoes, 18000), overpassOne(q.comida, 18000), overpassOne(q.hospedagem, 18000)]);
  const info = parts.map((p) => (p.status === "fulfilled" ? p.value.length : (p.reason as Error)?.message ?? "erro"));
  const elements = parts.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
  return { elements, info };
}

/**
 * Nominatim (OpenStreetMap) por categoria: comida, hospedagem e atrações principais.
 * Respeita a política de uso: 1 requisição por segundo, poucas por cidade, resultado guardado na base própria.
 */
// fila global: no máximo 1 requisição por segundo ao Nominatim nesta instância
let nominatimNext = 0;
async function nominatimSlot() {
  const now = Date.now();
  const wait = Math.max(0, nominatimNext - now);
  nominatimNext = Math.max(now, nominatimNext) + 1100;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function fromNominatim(city: string, country: string | null): Promise<OsmElement[]> {
  const where = country ? `${city}, ${country}` : city;
  const cats = ["restaurant", "cafe", "hotel", "hostel", "guest house", "museum", "viewpoint", "attraction", "bar"];
  const out: OsmElement[] = [];
  for (const cat of cats) {
    await nominatimSlot();
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${cat} in ${where}`)}&format=jsonv2&limit=40&extratags=1&namedetails=1&accept-language=pt-BR`;
      const data = (await fetchJSON(url, {}, 8000)) as { osm_type: string; osm_id: number; lat: string; lon: string; category: string; type: string; name: string; extratags?: Record<string, string>; namedetails?: Record<string, string> }[];
      for (const r of data) {
        if (!r.name) continue;
        out.push({
          type: r.osm_type, id: r.osm_id, lat: Number(r.lat), lon: Number(r.lon),
          tags: { name: r.namedetails?.["name:pt"] || r.name, [r.category]: r.type, ...(r.extratags ?? {}) },
        });
      }
    } catch {
      // segue com as outras categorias
    }
  }
  return out;
}

/** Reserva: atrações notáveis do Wikidata em volta do ponto. */
async function fromWikidata(lat: number, lng: number, radiusKm: number) {
  const q = `SELECT ?item ?itemLabel ?coord ?typeLabel WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${radiusKm}". }
    ?item wdt:P31 ?type. VALUES ?type { wd:Q33506 wd:Q570116 wd:Q4989906 wd:Q23413 wd:Q16970 wd:Q22698 wd:Q2977 wd:Q1076486 wd:Q207694 wd:Q40080 }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
  } LIMIT 150`;
  const data = await fetchJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {}, 20000);
  const typeMap: Record<string, string> = { museu: "museum", "atração turística": "attraction" };
  return (data.results?.bindings ?? []).map((b: Record<string, { value: string }>) => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
    const typeLabel = b.typeLabel?.value?.toLowerCase() || "";
    const tags: Record<string, string> = { name: b.itemLabel.value, wikidata: b.item.value.split("/").pop()! };
    if (/museu|museum/.test(typeLabel)) tags.tourism = "museum";
    else if (/castelo|castle|forte/.test(typeLabel)) tags.historic = "castle";
    else if (/igreja|catedral|church|cathedral|basílica/.test(typeLabel)) { tags.amenity = "place_of_worship"; }
    else if (/parque|park|jardim|garden/.test(typeLabel)) tags.leisure = "park";
    else if (/praia|beach/.test(typeLabel)) tags.natural = "beach";
    else if (/monumento|monument/.test(typeLabel)) tags.historic = "monument";
    else tags.tourism = typeMap[typeLabel] || "attraction";
    return { type: "wd", id: 0, lat: m ? Number(m[2]) : undefined, lon: m ? Number(m[1]) : undefined, tags };
  }).filter((e: { lat?: number; tags: Record<string, string> }) => e.lat != null && !/^Q\d+$/.test(e.tags.name));
}

/**
 * Candidatos de um destino. Usa a base própria (places) se já tiver lugares suficientes dos últimos 30 dias;
 * senão busca no OSM (e no Wikidata como reserva) e grava na base.
 */
export async function getCandidates(supabase: SupabaseClient, city: string, lat: number, lng: number, opts: { radius?: number; country?: string | null } = {}): Promise<{ candidates: Candidate[]; source: "cache" | "osm" | "wikidata" | "none" }> {
  const cityKey = city.toLowerCase().trim();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: cached } = await supabase.from("places").select("*").eq("city", cityKey).gte("updated_at", since).limit(900);
  // cache só vale se tiver variedade (atrações, comida e hospedagem), senão busca de novo
  const types = new Set((cached ?? []).map((c) => (c.tags as { type?: string })?.type));
  if (cached && cached.length >= 40 && types.has("restaurante") && types.has("hospedagem")) return { candidates: cached.map(rowToCandidate), source: "cache" };

  // OSM e Wikidata em paralelo, com teto de tempo; junta o que vier
  const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), ms))]);
  const [osm, wd, nom] = await Promise.allSettled([
    withTimeout(fromOverpass(lat, lng, opts.radius ?? 6000), 12000),
    withTimeout(fromWikidata(lat, lng, (opts.radius ?? 6000) / 1000), 15000),
    withTimeout(fromNominatim(city, opts.country ?? null), 20000),
  ]);
  const nomEls = nom.status === "fulfilled" ? nom.value : [];
  const osmEls = [...(osm.status === "fulfilled" ? osm.value.elements : []), ...nomEls];
  const wdEls = wd.status === "fulfilled" ? (wd.value as OsmElement[]) : [];
  // descarta resultados do Nominatim muito longe do centro (homônimos em outro lugar)
  const near = (e: OsmElement) => { const la = e.lat ?? e.center?.lat; const lo = e.lon ?? e.center?.lon; return la != null && lo != null && Math.abs(la - lat) < 0.25 && Math.abs(lo - lng) < 0.35; };
  const elements: OsmElement[] = [...osmEls, ...wdEls].filter(near);
  const source: "osm" | "wikidata" | "none" = osmEls.length ? "osm" : wdEls.length ? "wikidata" : "none";
  lastFetchInfo = { nominatim: nomEls.length, osm: osm.status === "fulfilled" ? osm.value.info : String((osm as PromiseRejectedResult).reason?.message ?? osm.status), wikidata: wd.status === "fulfilled" ? wdEls.length : String((wd as PromiseRejectedResult).reason?.message ?? wd.status) };

  const rows = [] as Record<string, unknown>[];
  const seen = new Set<string>();
  for (const e of elements) {
    const c = classify(e.tags || {});
    const la = e.lat ?? e.center?.lat;
    const lo = e.lon ?? e.center?.lon;
    if (!c || la == null || lo == null || !e.tags?.name) continue;
    const key = e.tags.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      osm_id: e.type === "wd" ? `wd:${e.tags.wikidata}` : `${e.type}/${e.id}`,
      wikidata_id: e.tags.wikidata ?? null,
      name: e.tags["name:pt"] || e.tags.name,
      lat: la,
      lng: lo,
      category: c.category,
      interest_category: c.interest,
      tags: { type: c.type, outdoor: c.outdoor, notability: notability(e.tags), cuisine: e.tags.cuisine, stars: e.tags.stars, wheelchair: e.tags.wheelchair, fee: e.tags.fee },
      own_price_level: c.price_level,
      opening_hours: e.tags.opening_hours ?? null,
      accessibility: e.tags.wheelchair ?? null,
      website: e.tags.website || e.tags["contact:website"] || null,
      phone: e.tags.phone || e.tags["contact:phone"] || null,
      city: cityKey,
      updated_at: new Date().toISOString(),
    });
  }
  // prioriza os mais notáveis e limita volume
  rows.sort((a, b) => ((b.tags as { notability: number }).notability) - ((a.tags as { notability: number }).notability));
  const limited = rows.slice(0, 600);
  if (limited.length) {
    const { data: saved } = await supabase.from("places").upsert(limited, { onConflict: "osm_id" }).select("*");
    if (saved?.length) return { candidates: saved.map(rowToCandidate), source };
  }
  return { candidates: (cached ?? []).map(rowToCandidate), source: cached?.length ? "cache" : source };
}

export function rowToCandidate(r: Record<string, unknown>): Candidate {
  const tags = (r.tags as Record<string, unknown>) || {};
  return {
    id: r.id as string,
    osm_id: (r.osm_id as string) ?? null,
    name: r.name as string,
    lat: r.lat as number,
    lng: r.lng as number,
    category: (r.category as string) || "lugar",
    interest: (r.interest_category as string) ?? null,
    type: (tags.type as Candidate["type"]) || "atracao",
    price_level: (r.own_price_level as number) ?? null,
    opening_hours: (r.opening_hours as string) ?? null,
    outdoor: !!tags.outdoor,
    notability: Number(tags.notability ?? 4),
    wikidata: (r.wikidata_id as string) ?? null,
    website: (r.website as string) ?? null,
    city: r.city as string,
  };
}

/** Escolhe um subconjunto equilibrado para mandar à IA (controla tamanho do prompt e custo). */
export function shortlist(cands: Candidate[], interests: Record<string, number>, profile: string, days: number): Candidate[] {
  const target = profile === "mochilao" ? 1 : profile === "experiencia" ? 3 : 2;
  const scoreOf = (c: Candidate) => {
    const w = c.interest ? interests[c.interest] ?? 0 : 0;
    const priceFit = c.price_level == null ? 0.6 : 1 - Math.abs(c.price_level - target) * 0.35;
    return c.notability * 0.6 + w * 1.5 + priceFit * 2;
  };
  const byType = (t: Candidate["type"]) => cands.filter((c) => c.type === t).sort((a, b) => scoreOf(b) - scoreOf(a));
  const perDay = Math.max(1, days);
  const attractions = byType("atracao").slice(0, Math.min(60, 8 + perDay * 6));
  const experiences = byType("experiencia").slice(0, 8);
  const food = byType("restaurante").slice(0, Math.min(40, 6 + perDay * 4));
  // hospedagem: algumas de cada faixa de preço para permitir 3 perfis
  const hotels = byType("hospedagem");
  const lodging = [1, 2, 3].flatMap((lvl) => hotels.filter((h) => (h.price_level ?? 2) === lvl).slice(0, 4));
  return [...attractions, ...experiences, ...food, ...lodging];
}
