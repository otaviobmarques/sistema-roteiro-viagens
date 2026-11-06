// Clima típico de cada cidade no mês da viagem e o que levar na mala (cache por cidade e mês).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { askJSON } from "./claude";
import { supabaseAnon } from "../supabase/server";

const ClimateSchema = z.object({
  summary: z.string().describe("como costuma ser o clima nesse mês, em até 25 palavras"),
  tmin: z.number().describe("mínima média em °C"),
  tmax: z.number().describe("máxima média em °C"),
  rain: z.string().describe("chuva no mês: pouca, moderada ou muita, com uma frase curta"),
  clothing: z.array(z.string()).describe("5 a 7 itens de roupa e calçado para levar, práticos (ex.: casaco impermeável, roupas em camadas, tênis confortável)"),
});
export type Climate = z.infer<typeof ClimateSchema> & { city: string; month: number };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Clima típico por cidade no mês de chegada. Nunca lança erro. */
export async function typicalClimate(supabase: SupabaseClient, dests: { city: string; country: string | null; start: string | null }[]): Promise<Climate[]> {
  const out = await Promise.all(dests.filter((d) => d.start).map(async (d) => {
    const month = Number(d.start!.slice(5, 7));
    const key = `clima|${n(d.city)}|${n(d.country ?? "")}|${month}`;
    const { data: row } = await supabase.from("city_fees").select("data").eq("city", key).maybeSingle();
    if (row?.data) return { ...(row.data as z.infer<typeof ClimateSchema>), city: d.city, month };
    try {
      const r = await askJSON({
        schema: ClimateSchema, effort: "low", maxTokens: 800,
        system: "Você é o Pino, do Rotta 365. Descreve o clima típico (médias históricas) de forma curta, em português do Brasil, sem citar marcas.",
        prompt: `Cidade: ${d.city}${d.country ? `, ${d.country}` : ""}. Mês: ${MONTHS[month - 1]}.`,
      });
      await supabaseAnon().rpc("server_upsert_city_fees", { p_secret: process.env.INTERNAL_SECRET, p_city: key, p_display: d.city, p_data: r.data });
      return { ...r.data, city: d.city, month };
    } catch {
      return null;
    }
  }));
  return out.filter(Boolean) as Climate[];
}

export const monthName = (m: number) => MONTHS[m - 1];
