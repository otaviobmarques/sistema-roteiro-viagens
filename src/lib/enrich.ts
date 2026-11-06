// Enriquecimento do roteiro: fotos dos lugares (Wikimedia Commons, gratuitas) e "como chegar" em cada trecho.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { askJSON, type AIUsage } from "./ai/claude";
import type { Candidate } from "./places";
import { modeLabel } from "./domain/geo";

const UA = "Rotta365/1.0 (roteiros de viagem; contato rotta365.com.br)";
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function getJSON(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type Photo = { url: string; credit: string };

/** Foto de cada lugar via Wikidata (P18) → Commons, com autor e licença. Usa e alimenta o cache em `places`. */
export async function photosFor(supabase: SupabaseClient, cands: Candidate[]): Promise<Map<string, Photo>> {
  const out = new Map<string, Photo>();
  const uniq = [...new Map(cands.filter((c) => c.id).map((c) => [c.id, c])).values()];
  if (!uniq.length) return out;
  const { data: cached } = await supabase.from("places").select("id, photo_url, photo_credit, photo_checked_at").in("id", uniq.map((c) => c.id));
  const checked = new Set<string>();
  (cached ?? []).forEach((p) => {
    if (p.photo_checked_at) checked.add(p.id);
    if (p.photo_url) out.set(p.id, { url: p.photo_url, credit: p.photo_credit ?? "Wikimedia Commons" });
  });
  const todo = uniq.filter((c) => !checked.has(c.id) && c.wikidata && /^Q\d+$/.test(c.wikidata));
  const noWiki = uniq.filter((c) => !checked.has(c.id) && !(c.wikidata && /^Q\d+$/.test(c.wikidata)));

  // Wikidata: nome do arquivo da imagem principal (P18), 50 por chamada
  const fileByQ = new Map<string, string>();
  for (let i = 0; i < todo.length; i += 50) {
    const ids = todo.slice(i, i + 50).map((c) => c.wikidata).join("|");
    const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`);
    for (const [q, ent] of Object.entries((d?.entities ?? {}) as Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: string } } }[]> }>)) {
      const f = ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (typeof f === "string") fileByQ.set(q, f);
    }
  }
  // Commons: miniatura + autor + licença, 50 por chamada
  const infoByFile = new Map<string, Photo>();
  const files = [...new Set(fileByQ.values())];
  for (let i = 0; i < files.length; i += 50) {
    const titles = files.slice(i, i + 50).map((f) => `File:${f}`).join("|");
    const d = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&format=json&formatversion=2`);
    for (const p of (d?.query?.pages ?? []) as { title: string; imageinfo?: { thumburl?: string; url?: string; extmetadata?: Record<string, { value?: string }> }[] }[]) {
      const ii = p.imageinfo?.[0];
      const url = ii?.thumburl || ii?.url;
      if (!url) continue;
      const artist = strip(ii?.extmetadata?.Artist?.value ?? "").slice(0, 60);
      const lic = strip(ii?.extmetadata?.LicenseShortName?.value ?? "");
      infoByFile.set(p.title.replace(/^File:/, "").replace(/_/g, " "), { url, credit: ["Foto", artist || null, lic || null, "Wikimedia Commons"].filter(Boolean).join(" · ").replace("Foto · ", "Foto: ") });
    }
  }
  const updates: PromiseLike<unknown>[] = [];
  for (const c of todo) {
    const f = fileByQ.get(c.wikidata!);
    const ph = f ? infoByFile.get(f.replace(/_/g, " ")) : undefined;
    if (ph) out.set(c.id, ph);
    updates.push(supabase.from("places").update({ photo_url: ph?.url ?? null, photo_credit: ph?.credit ?? null, photo_checked_at: new Date().toISOString() }).eq("id", c.id));
  }
  // sem Wikidata: marca como verificado para não tentar toda vez (o cache pode ser renovado depois)
  for (const c of noWiki) updates.push(supabase.from("places").update({ photo_checked_at: new Date().toISOString() }).eq("id", c.id));
  await Promise.allSettled(updates);
  return out;
}

// ---------- como chegar ----------
export type LegIn = { key: string; city: string; country: string | null; from: string; to: string; mode: string; minutes: number; km: number };
export type LegTip = { tip: string; fare_cents: number | null };

const TipSchema = z.object({
  legs: z.array(z.object({
    key: z.string(),
    tip: z.string().describe("como ir, em até 28 palavras: linha/estação ou ponto quando tiver segurança; senão orientação geral"),
    fare_brl: z.number().nullable().describe("preço estimado por pessoa em reais; null se a pé"),
  })),
});

/** Dicas de trajeto (metrô, ônibus, trem, táxi) para os trechos já na ordem final do dia. Uma chamada por cidade. */
export async function transitTips(legs: LegIn[]): Promise<{ tips: Map<string, LegTip>; usage: AIUsage }> {
  const tips = new Map<string, LegTip>();
  const usage: AIUsage = { inputTokens: 0, outputTokens: 0, costCents: 0, ms: 0 };
  // a pé e perto: não precisa de IA
  const needAI: LegIn[] = [];
  for (const l of legs) {
    if (l.mode === "a_pe") tips.set(l.key, { tip: `A pé, cerca de ${l.minutes} min (${l.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km).`, fare_cents: null });
    else needAI.push(l);
  }
  const byCity = new Map<string, LegIn[]>();
  needAI.forEach((l) => byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]));
  await Promise.all([...byCity.entries()].map(async ([city, ls]) => {
    try {
      const r = await askJSON({
        schema: TipSchema,
        effort: "low",
        maxTokens: 4000,
        system: "Você é o Pino, guia do Rotta 365. Explica de forma curta e prática como ir de um ponto turístico a outro, em português do Brasil.",
        prompt: [
          `Cidade: ${city}${ls[0].country ? `, ${ls[0].country}` : ""}.`,
          "Para cada trecho, diga como ir. Se o modo for transporte público, cite a linha de metrô/ônibus/trem e as estações SÓ quando tiver certeza; se não tiver, oriente de forma geral (ex.: 'metrô até a estação mais próxima do centro histórico'). Se for táxi/app, cite o app comum na cidade e o preço aproximado. Sempre preço por pessoa em reais.",
          "Trechos (chave | de → para | modo sugerido | distância | tempo):",
          ...ls.map((l) => `${l.key} | ${l.from} → ${l.to} | ${modeLabel(l.mode)} | ${l.km.toFixed(1)} km | ${l.minutes} min`),
        ].join("\n"),
      });
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
      usage.costCents += r.usage.costCents;
      r.data.legs.forEach((x) => { if (ls.some((l) => l.key === x.key)) tips.set(x.key, { tip: x.tip.trim(), fare_cents: x.fare_brl != null ? Math.round(x.fare_brl * 100) : null }); });
    } catch {
      // sem dica da IA: o app mostra só o botão do Google Maps
    }
  }));
  return { tips, usage };
}
