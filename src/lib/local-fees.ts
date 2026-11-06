// Taxas locais (ambiental, de turismo, de acesso, de hospedagem): lista fixa dos casos conhecidos + pesquisa do Pino.
// Sem valores fixos no código: os valores mudam todo ano. Quando o Pino souber, vem como estimativa.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { askJSON } from "./ai/claude";
import { supabaseAnon } from "./supabase/server";

export type FeeWho = "veiculo" | "pessoa" | "pessoa_noite" | "pessoa_dia";
export type LocalFee = {
  city: string;
  name: string;
  who: FeeWho;
  how: string;        // como e onde pagar
  approx_brl: number | null; // estimativa por unidade (pessoa, noite, dia ou veículo)
  checklist: string;  // tarefa no checklist
  due: number;        // dias antes da chegada
  source: "fixo" | "pino";
};

export const WHO_LABEL: Record<FeeWho, string> = { veiculo: "por veículo", pessoa: "por pessoa", pessoa_noite: "por pessoa, por noite", pessoa_dia: "por pessoa, por dia" };

const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Fixed = Omit<LocalFee, "city" | "source" | "approx_brl"> & { match: RegExp };
const FIXED_CITY: Fixed[] = [
  { match: /^ubatuba$/, name: "Taxa de Preservação Ambiental (TPA)", who: "veiculo", how: "Cobrada de veículos de fora da cidade. Pague online no site da prefeitura antes de entrar; a cobrança costuma ser pela leitura da placa.", checklist: "Ubatuba: pagar a Taxa de Preservação Ambiental do veículo (se for de carro)", due: 2 },
  { match: /^ilhabela$/, name: "Taxa de Preservação Ambiental (TPA)", who: "veiculo", how: "Cobrada de veículos de fora da cidade. Confira no site da prefeitura como e quando pagar.", checklist: "Ilhabela: pagar a Taxa de Preservação Ambiental do veículo (se for de carro)", due: 2 },
  { match: /^bombinhas$/, name: "Taxa de Preservação Ambiental (TPA)", who: "veiculo", how: "Cobrada de veículos de fora na temporada. Pague online ou na entrada da cidade.", checklist: "Bombinhas: pagar a Taxa de Preservação Ambiental do veículo (se for de carro)", due: 2 },
  { match: /noronha/, name: "Taxa de Preservação Ambiental (TPA) diária", who: "pessoa_dia", how: "Obrigatória para todo visitante, por dia de permanência. Pague online antes de embarcar e leve o comprovante. O Parque Nacional Marinho cobra ingresso à parte.", checklist: "Fernando de Noronha: pagar a TPA diária e o ingresso do Parque Nacional antes do embarque", due: 7 },
  { match: /jericoacoara|^jeri$/, name: "Taxa de Turismo Sustentável", who: "pessoa", how: "Cobrada de visitantes. Pague online antes de chegar e guarde o comprovante.", checklist: "Jericoacoara: pagar a Taxa de Turismo Sustentável antes de chegar", due: 3 },
  { match: /morro de sao paulo/, name: "TUPA (tarifa de uso do arquipélago)", who: "pessoa", how: "Cobrada de visitantes na chegada a Morro de São Paulo. Leve dinheiro ou cartão.", checklist: "Morro de São Paulo: separar o valor da TUPA, cobrada na chegada", due: 1 },
  { match: /ilha do mel/, name: "Taxa de visitação", who: "pessoa", how: "Cobrada no embarque para a ilha. Confira o valor e a forma de pagamento antes.", checklist: "Ilha do Mel: separar o valor da taxa de visitação, cobrada no embarque", due: 1 },
  { match: /^(veneza|venezia|venice)$/, name: "Taxa de acesso para visitantes de um dia", who: "pessoa", how: "Em datas de alta temporada, quem visita sem dormir na cidade paga a taxa online antes. Quem se hospeda é isento, mas paga a taxa de turismo no hotel.", checklist: "Veneza: ver se as suas datas têm taxa de acesso (visitantes de um dia pagam online)", due: 7 },
  { match: /^bali$/, name: "Taxa de turismo para estrangeiros", who: "pessoa", how: "Cobrada de turistas estrangeiros. Pague online antes de chegar.", checklist: "Bali: pagar a taxa de turismo para estrangeiros antes de chegar", due: 5 },
];
// países onde muitas cidades cobram taxa de turismo na hospedagem (por pessoa, por noite)
const HOTEL_TAX_COUNTRIES = new Set(["franca", "italia", "portugal", "espanha", "holanda", "paises baixos", "alemanha", "austria", "republica tcheca", "tchequia", "belgica", "hungria", "grecia", "croacia", "suica"]);

const AiFees = z.object({
  fees: z.array(z.object({
    name: z.string(),
    who: z.enum(["veiculo", "pessoa", "pessoa_noite", "pessoa_dia"]),
    how: z.string().describe("como e onde pagar, em até 30 palavras"),
    approx_brl: z.number().nullable().describe("valor aproximado em reais por unidade; null se não souber"),
  })),
});

async function aiFees(supabase: SupabaseClient, city: string, country: string | null): Promise<LocalFee[]> {
  const key = `${n(city)}|${n(country ?? "")}`;
  const { data: row } = await supabase.from("city_fees").select("data, updated_at").eq("city", key).maybeSingle();
  let fees: z.infer<typeof AiFees>["fees"] | null = null;
  if (row && Date.now() - new Date(row.updated_at).getTime() < 120 * 86400000) fees = (row.data as { fees: typeof fees }).fees ?? [];
  if (!fees) {
    try {
      const r = await askJSON({
        schema: AiFees, effort: "low", maxTokens: 1200,
        system: "Você é o Pino, do Rotta 365. Liste SOMENTE taxas oficiais que você tem certeza de que existem para entrar ou visitar a cidade (taxa ambiental, de turismo, de acesso, de hospedagem municipal). Não inclua ingressos de atrações, estacionamento nem pedágios. Se não tiver certeza, devolva lista vazia. Nunca invente valores; sem certeza, use null. Português do Brasil, sem citar empresas.",
        prompt: `Cidade: ${city}${country ? `, ${country}` : ""}. Quais taxas o turista paga para entrar ou se hospedar?`,
      });
      fees = r.data.fees.slice(0, 3);
      await supabaseAnon().rpc("server_upsert_city_fees", { p_secret: process.env.INTERNAL_SECRET, p_city: key, p_display: city, p_data: { fees } });
    } catch {
      fees = [];
    }
  }
  return fees.map((f) => ({ city, name: f.name, who: f.who, how: f.how, approx_brl: f.approx_brl, checklist: `${city}: ${f.name} (${WHO_LABEL[f.who]})`, due: 3, source: "pino" as const }));
}

/** Taxas de cada destino da viagem: lista fixa primeiro; o Pino pesquisa as cidades que não estão nela. Nunca lança erro. */
export async function localFees(supabase: SupabaseClient, dests: { city: string; country: string | null }[]): Promise<LocalFee[]> {
  const out: LocalFee[] = [];
  const hotelCountries = new Set<string>();
  await Promise.all(dests.map(async (d) => {
    const fixed = FIXED_CITY.filter((f) => f.match.test(n(d.city)));
    if (fixed.length) { fixed.forEach(({ match: _m, ...f }) => out.push({ ...f, city: d.city, approx_brl: null, source: "fixo" })); return; }
    const ai = await aiFees(supabase, d.city, d.country).catch(() => []);
    // a taxa de hospedagem dos países europeus já entra uma vez por país (abaixo)
    out.push(...ai.filter((f) => !(f.who === "pessoa_noite" && d.country && HOTEL_TAX_COUNTRIES.has(n(d.country)))));
  }));
  for (const d of dests) if (d.country && HOTEL_TAX_COUNTRIES.has(n(d.country))) hotelCountries.add(d.country);
  for (const c of hotelCountries) {
    const cities = dests.filter((d) => d.country === c).map((d) => d.city);
    out.push({ city: cities.join(", "), name: "Taxa de turismo na hospedagem", who: "pessoa_noite", how: `Em muitas cidades de ${c}, o hotel cobra uma taxa municipal por pessoa e por noite, em geral no check-in e fora do valor da reserva. Confira na sua reserva.`, approx_brl: null, checklist: `Separar a taxa de turismo cobrada na hospedagem em ${cities.join(", ")} (por pessoa, por noite)`, due: 2, source: "fixo" });
  }
  return out;
}

/** Estimativa por pessoa da viagem inteira (só taxas com valor aproximado). */
export function feesPerPerson(fees: LocalFee[], nightsByCity: Record<string, number>, people: number): number {
  let c = 0;
  for (const f of fees) {
    if (f.approx_brl == null) continue;
    const nights = nightsByCity[f.city] ?? 1;
    const unit = f.approx_brl * 100;
    c += f.who === "veiculo" ? unit / Math.max(1, people) : f.who === "pessoa" ? unit : unit * Math.max(1, nights);
  }
  return Math.round(c);
}
