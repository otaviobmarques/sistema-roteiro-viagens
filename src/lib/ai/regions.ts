// Destino que é país ou estado (ex.: "França", "Toscana"): o Pino escolhe as cidades-base e os dias de cada uma.
import { z } from "zod";
import { askJSON, PINO_VOICE, type AIUsage } from "./claude";

const Schema = z.object({
  cities: z.array(z.object({
    city: z.string().describe("nome da cidade em português, só a cidade (ex.: Paris, Florença)"),
    days: z.number().int().min(1),
    why: z.string().describe("motivo em até 12 palavras"),
  })).min(1).max(5),
});

export type RegionCity = z.infer<typeof Schema>["cities"][number];

export async function expandRegion(args: {
  region: string; country: string | null; kind: "country" | "state"; days: number;
  profile: string; pace: string; interests: Record<string, number>; occasion?: string | null; notes?: string | null;
  arrival?: string | null; departure?: string | null; mustHaves?: string[];
}): Promise<{ cities: RegionCity[]; usage: AIUsage }> {
  const top = Object.entries(args.interests).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6).join(", ") || "variados";
  const maxCities = args.days <= 3 ? 1 : args.days <= 6 ? 2 : args.days <= 10 ? 3 : args.days <= 16 ? 4 : 5;
  const r = await askJSON({
    schema: Schema,
    effort: "low",
    maxTokens: 1500,
    system: `${PINO_VOICE}\nVocê escolhe as cidades-base de uma viagem quando o cliente informou um ${args.kind === "country" ? "país" : "estado/região"} inteiro.`,
    prompt: [
      `Destino informado: ${args.region}${args.country && args.country !== args.region ? ` (${args.country})` : ""}. Total de ${args.days} dia(s) nesse destino.`,
      `Perfil de gasto: ${args.profile}. Ritmo: ${args.pace}. Interesses principais: ${top}.`,
      args.occasion ? `Ocasião: ${args.occasion}.` : "",
      args.mustHaves?.length ? `Não abre mão de: ${args.mustHaves.join("; ")} (escolha cidades que permitam isso).` : "",
      args.notes ? `Observações do cliente: ${args.notes}` : "",
      args.arrival ? `Chega por: ${args.arrival}.` : "",
      args.departure ? `Sai por: ${args.departure}.` : "",
      `Escolha de 1 a ${maxCities} cidades-base (onde dormir), as mais indicadas para um primeiro roteiro com esse perfil, em ordem lógica de deslocamento.`,
      `Regras: cidades conhecidas, com boa estrutura turística; prefira 2 dias ou mais por cidade; a soma dos dias deve ser exatamente ${args.days}; se o cliente chega ou sai por uma cidade, ela costuma entrar no roteiro; nunca use vilarejos pequenos como base.`,
    ].filter(Boolean).join("\n"),
  });
  const cities = r.data.cities.slice(0, maxCities);
  // garante a soma exata de dias
  let diff = args.days - cities.reduce((s, c) => s + c.days, 0);
  while (diff !== 0 && cities.length) {
    const i = diff > 0 ? 0 : cities.findIndex((c) => c.days === Math.max(...cities.map((x) => x.days)));
    if (diff < 0 && cities[i].days <= 1) break;
    cities[i] = { ...cities[i], days: cities[i].days + Math.sign(diff) };
    diff -= Math.sign(diff);
  }
  return { cities, usage: r.usage };
}
