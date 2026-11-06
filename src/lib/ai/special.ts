// Guia personalizado para necessidades especiais da viagem (só é gerado quando o cliente marca alguma).
import { z } from "zod";
import { askJSON, type AIUsage } from "./claude";

export type SpecialNeeds = { alergia?: string | null; mobilidade?: boolean; pet?: boolean; gestante?: boolean; esportes?: boolean };
export const hasNeeds = (n?: SpecialNeeds | null) => !!n && (!!n.alergia || !!n.mobilidade || !!n.pet || !!n.gestante || !!n.esportes);

/** Texto curto para o Pino considerar ao montar o roteiro. */
export function needsBriefing(n?: SpecialNeeds | null): string {
  if (!hasNeeds(n)) return "";
  const p: string[] = [];
  if (n!.alergia) p.push(`Alergia/restrição alimentar: ${n!.alergia} (escolha restaurantes com opções seguras)`);
  if (n!.mobilidade) p.push("Mobilidade reduzida: evite ladeiras, escadarias e trilhas; prefira táxi e lugares acessíveis");
  if (n!.pet) p.push("Viaja com pet: prefira parques e passeios ao ar livre que aceitem animais");
  if (n!.gestante) p.push("Gestante: ritmo leve, pausas, nada de atividade de risco");
  if (n!.esportes) p.push("Gosta de esportes radicais ou de neve: inclua quando houver no destino");
  return p.join(". ");
}

const SpecialSchema = z.object({
  allergy_cards: z.array(z.object({
    language: z.string(),
    text: z.string().describe("cartão para mostrar no restaurante, no idioma local, educado e claro, 2 a 3 frases"),
    pt: z.string().describe("o mesmo texto em português"),
  })).describe("um cartão por idioma dos destinos; [] se não houver alergia"),
  accessibility: z.array(z.object({ city: z.string(), note: z.string().describe("ladeiras, calçadas, metrô com elevador, táxi adaptado, atrações acessíveis; até 35 palavras") })).describe("[] se não houver mobilidade reduzida"),
  pets: z.object({ summary: z.string(), steps: z.array(z.string()).describe("exigências e prazos: microchip, vacina antirrábica, sorologia (quando exigida), atestado veterinário internacional, regras de cabine e porão") }).nullable(),
  pregnancy: z.string().nullable().describe("cuidados para gestante: semanas de gestação aceitas pelas companhias aéreas, atestado, seguro, vacinas; até 45 palavras; null se não for o caso"),
  sports: z.string().nullable().describe("cobertura de seguro e cuidados para esportes radicais ou neve nesses destinos; até 35 palavras; null se não for o caso"),
});
export type SpecialGuide = z.infer<typeof SpecialSchema>;

export async function specialGuide(needs: SpecialNeeds, dests: { city: string; country: string | null }[]): Promise<{ guide: SpecialGuide; usage: AIUsage } | null> {
  if (!hasNeeds(needs)) return null;
  const r = await askJSON({
    schema: SpecialSchema, effort: "low", maxTokens: 3000,
    system: "Você é o Pino, do Rotta 365. Escreve orientações práticas e corretas para turistas brasileiros com necessidades especiais, em português do Brasil, sem citar empresas ou marcas. Quando uma regra puder mudar, diga para confirmar no site oficial.",
    prompt: [
      `Destinos: ${dests.map((d) => `${d.city}${d.country ? ` (${d.country})` : ""}`).join(", ")}. Saindo do Brasil.`,
      needs.alergia ? `Alergia ou restrição alimentar: ${needs.alergia}. Faça o cartão de alergia em cada idioma dos destinos (se for português, só em português).` : "Sem alergia: allergy_cards = [].",
      needs.mobilidade ? "Mobilidade reduzida: notas de acessibilidade por cidade." : "Sem mobilidade reduzida: accessibility = [].",
      needs.pet ? "Viaja com pet (cão ou gato): exigências para entrar com o animal nesses países e regras gerais de transporte aéreo." : "Sem pet: pets = null.",
      needs.gestante ? "Viajante gestante: cuidados." : "Não é gestante: pregnancy = null.",
      needs.esportes ? "Vai praticar esportes radicais ou de neve: cuidados e seguro." : "Sem esportes: sports = null.",
    ].join("\n"),
  });
  return { guide: r.data, usage: r.usage };
}
