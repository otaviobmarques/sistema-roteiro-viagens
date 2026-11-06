// Assistente conversacional (M15): o Pino propõe ações; nada é gravado sem confirmação (RN-03).
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJSON, PINO_VOICE } from "./claude";
import { normalizeKind } from "./normalize";
import { getCandidates, shortlist, type Candidate } from "../places";
import { cascade } from "../domain/schedule";
import type { Item, Day } from "../types";

export const ActionSchema = z.object({
  type: z.enum(["add", "remove", "move", "update"]),
  label: z.string().describe("descrição curta da mudança para o cartão, ex.: 'Trocar jantar por Taberna X'"),
  item_id: z.string().nullable().describe("id do item existente (remove/move/update)"),
  day_id: z.string().nullable().describe("dia de destino (add/move)"),
  position: z.number().int().nullable().describe("posição no dia, 0 = primeiro"),
  candidate: z.string().nullable().describe("código Pxx do lugar (add, ou update trocando o lugar)"),
  title: z.string().nullable(),
  kind: z.string().nullable().describe("lugar, atividade, refeicao, hospedagem, nota ou livre"),
  duration_min: z.number().int().nullable(),
  fixed_time: z.string().nullable().describe("HH:MM se for horário fixo"),
});
export type PinoAction = z.infer<typeof ActionSchema>;

const ReplySchema = z.object({
  reply: z.string().describe("resposta curta na voz do Pino"),
  actions: z.array(ActionSchema).describe("mudanças propostas; [] se for só uma pergunta"),
});

export async function loadTripContext(supabase: SupabaseClient, tripId: string, dayId: string | null) {
  const [{ data: trip }, { data: days }, { data: items }, { data: dests }, { data: prefs }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("days").select("*").eq("trip_id", tripId).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", tripId).order("position"),
    supabase.from("trip_destinations").select("*").eq("trip_id", tripId).order("position"),
    supabase.from("trip_preferences").select("*").eq("trip_id", tripId).maybeSingle(),
  ]);
  const day = (days ?? []).find((d) => d.id === dayId) ?? (days ?? [])[0];
  const dest = (dests ?? []).find((d) => d.id === day?.destination_id) ?? (dests ?? [])[0];
  let candidates: Candidate[] = [];
  if (dest?.lat != null) {
    const r = await getCandidates(supabase, dest.city, dest.lat, dest.lng, { country: dest.country }).catch(() => ({ candidates: [] as Candidate[] }));
    candidates = shortlist(r.candidates, (prefs?.interests as Record<string, number>) ?? {}, prefs?.travel_profile ?? "classica", 2).slice(0, 60);
  }
  return { trip, days: (days ?? []) as Day[], items: (items ?? []) as Item[], dest, day, prefs, candidates };
}

export function describeTrip(days: Day[], items: Item[], focusDay: string | null) {
  return days
    .map((d) => {
      const list = items.filter((i) => i.day_id === d.id).sort((a, b) => a.position - b.position);
      const r = cascade(list, { date: d.date, dayStart: d.day_start || "09:00" });
      const detail = d.id === focusDay || days.length <= 4
        ? r.items.map((i) => `  - [${i.id}] ${i.start} ${i.title} (${i.kind}, ${i.duration_min} min${i.anchor ? `, fixo ${i.anchor_time}` : ""}${i.must_have ? ", não abro mão" : ""})`).join("\n")
        : `  ${list.map((i) => i.title).join(", ")}`;
      return `DIA [${d.id}] ${d.date ?? ""} ${d.title ?? ""}${d.id === focusDay ? " (dia aberto na tela)" : ""}\n${detail}`;
    })
    .join("\n");
}

export async function askPino(opts: { message: string; history: { role: "user" | "pino"; text: string }[]; context: Awaited<ReturnType<typeof loadTripContext>>; dayId: string | null }) {
  const { context: c } = opts;
  const codes = new Map<string, Candidate>();
  const candText = c.candidates.map((x, i) => { const code = `P${i + 1}`; codes.set(code, x); return `${code} | ${x.name} | ${x.category} | ${x.opening_hours ?? "?"}`; }).join("\n");
  const prompt = `VIAGEM: ${c.trip?.title} · ${c.trip?.start_date} a ${c.trip?.end_date} · perfil ${c.prefs?.travel_profile ?? "classica"} · ritmo ${c.trip?.pace}
ROTEIRO ATUAL:
${describeTrip(c.days, c.items, opts.dayId)}

LUGARES VERIFICADOS PERTO DE ${c.dest?.city ?? "?"} (código | nome | tipo | horário):
${candText || "nenhum"}

CONVERSA ANTERIOR:
${opts.history.slice(-6).map((h) => `${h.role === "user" ? "Pessoa" : "Pino"}: ${h.text}`).join("\n") || "-"}

PEDIDO: ${opts.message}`;
  const r = await askJSON({
    schema: ReplySchema,
    system: `${PINO_VOICE}
Você conversa sobre a viagem e propõe mudanças como ações estruturadas. Regras:
- Para adicionar ou trocar lugares, use SOMENTE códigos da lista de lugares verificados.
- Itens "não abro mão" e itens com horário fixo nunca são removidos nem movidos por você; se for preciso, explique e pergunte.
- Use os ids entre colchetes para referenciar dias e itens existentes. Proponha poucas ações, claras.
- Se for só uma pergunta, responda e deixe actions vazio.`,
    prompt,
    effort: "low",
    maxTokens: 6000,
  });
  r.data.actions.forEach((a) => { if (a.kind) a.kind = normalizeKind(a.kind); });
  return { ...r, codes };
}
