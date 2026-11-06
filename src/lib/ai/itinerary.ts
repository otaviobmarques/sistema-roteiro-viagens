// Pipeline de geração do roteiro (seção 9.1): briefing → candidatos → curadoria → rascunho → verificação → apresentação.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJSON, PINO_VOICE, type AIUsage } from "./claude";
import { getCandidates, shortlist, geocode, type Candidate } from "../places";
import { weather, holidays } from "../context";
import { cascade, optimizeDay, tripViability, type ScheduleItem } from "../domain/schedule";
import { suggestMode, travelMinutes } from "../domain/geo";
import { addDays, daysBetween, fromMin } from "../domain/time";
import { fitScore, forYouScore, TRAVEL_PROFILES, INTEREST_CATEGORIES, type TravelProfile } from "../domain/score";
import { transferLegs } from "../domain/multidest";
import { normalizeKind, normalizeProfile } from "./normalize";


const PROFILES = ["mochilao", "classica", "experiencia"] as const;

const OptionSchema = z.object({
  candidate: z.string().describe("código do candidato, ex.: P12"),
  profile: z.string().describe("mochilao, classica ou experiencia"),
  price_brl: z.number().describe("preço estimado por pessoa em reais (hospedagem: por noite, por quarto)"),
  reason: z.string().describe("motivo curto, até 12 palavras"),
});

const ItemSchema = z.object({
  candidate: z.string().nullable().describe("código do candidato escolhido; null só para nota/livre ou obrigatório fora da lista"),
  kind: z.string().describe("um destes: lugar, atividade, refeicao, hospedagem, nota, livre"),
  title: z.string(),
  duration_min: z.number().int(),
  fixed_time: z.string().nullable().describe("HH:MM apenas se o horário for fixo (ingresso com hora, reserva); senão null"),
  cost_brl: z.number().describe("custo estimado por pessoa em reais no perfil da viagem"),
  must_have: z.boolean(),
  why: z.string().describe("por que o Pino escolheu: interesses atendidos, encaixe no orçamento e na rota; até 22 palavras"),
  options: z.array(OptionSchema).describe("para hospedagem, refeições e passeios principais: 3 opções, uma de cada perfil; senão []"),
});

const DaySchema = z.object({
  date: z.string().describe("YYYY-MM-DD"),
  title: z.string().describe("tema curto do dia, ex.: Alfama e miradouros"),
  items: z.array(ItemSchema),
});

const DestinationPlanSchema = z.object({
  days: z.array(DaySchema),
  must_haves: z.array(z.object({ text: z.string(), status: z.enum(["aplicado", "sem_espaco"]), note: z.string() })),
  tips: z.array(z.string()).describe("até 3 dicas práticas (ingressos que esgotam, melhor horário)"),
});
type DestinationPlan = z.infer<typeof DestinationPlanSchema>;

export type TripBriefing = {
  profile: TravelProfile;
  pace: string;
  interests: Record<string, number>;
  adults: number;
  children: number;
  childrenAges: number[];
  occasion: string | null;
  notes: string | null;
  mustHaves: string[];
  budgetCapCents: number | null;
  restrictions: Record<string, unknown>;
};

type DestinationInput = { id: string; city: string; country: string | null; lat: number; lng: number; start: string; days: number };

function interestsText(interests: Record<string, number>) {
  const label = (id: string) => INTEREST_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  const w = (n: number) => (n === 3 ? "Amo" : n === 2 ? "Curto muito" : "Gosto");
  return Object.entries(interests).filter(([, v]) => v > 0).map(([k, v]) => `${label(k)} (${w(v)})`).join(", ") || "não informado";
}

function candidateLines(cands: Candidate[], codes: Map<string, Candidate>, offset: number) {
  return cands
    .map((c, i) => {
      const code = `P${offset + i + 1}`;
      codes.set(code, c);
      const price = c.price_level ? "$".repeat(c.price_level) : "?";
      return `${code} | ${c.name} | ${c.category} | ${c.interest ?? "-"} | ${price} | ${c.opening_hours ?? "horário ?"}${c.outdoor ? " | ao ar livre" : ""}`;
    })
    .join("\n");
}

const SYSTEM = `${PINO_VOICE}

Você monta roteiros de viagem estruturados. Regras obrigatórias:
- Escolha SOMENTE lugares da lista de candidatos, citando o código (P1, P2...). Nunca invente lugares. Exceção: itens da lista "não abro mão" que não estejam na lista (use candidate null e must_have true) e itens do tipo nota/livre.
- Itens "não abro mão" são travados: sempre entram. Se não couberem nos dias, marque status sem_espaco e explique; nunca corte sozinho.
- Respeite o perfil de gasto, o ritmo, as restrições (crianças, mobilidade, alimentação) e a ocasião.
- Cada dia: comece com a hospedagem apenas no primeiro dia do destino; inclua almoço e jantar (refeicao) com restaurantes da lista; agrupe lugares próximos; respeite horários de funcionamento e dias de fechamento.
- Ritmo: leve = 3 a 4 atividades/dia; equilibrado = 4 a 5; intenso = 5 a 7 (sem contar refeições).
- Categorias marcadas como "Amo" aparecem em quase todos os dias; toda categoria escolhida aparece pelo menos uma vez.
- Para hospedagem, refeições e passeios principais, dê 3 opções (uma de cada perfil: mochilao, classica, experiencia), escolhidas entre os candidatos, com preço estimado em reais.
- Durações realistas em minutos. Preços em reais, estimados e conservadores.`;

async function planDestination(d: DestinationInput, b: TripBriefing, cands: Candidate[], codes: Map<string, Candidate>, offset: number, ctx: { weatherByDate: Record<string, { rain: number | null; tmax: number | null }>; holidaySet: Set<string>; isFirst: boolean }) {
  const dates = Array.from({ length: d.days }, (_, i) => addDays(d.start, i));
  const datesText = dates
    .map((dt) => {
      const w = ctx.weatherByDate[dt];
      const hol = ctx.holidaySet.has(dt) ? " (feriado: lugares podem fechar)" : "";
      return `${dt}${w && w.rain != null ? ` · chuva ${w.rain}% · máx ${Math.round(w.tmax ?? 0)}°C` : ""}${hol}`;
    })
    .join("\n");
  const prompt = `DESTINO: ${d.city}${d.country ? `, ${d.country}` : ""}
DIAS (${d.days}):
${datesText}

VIAJANTES: ${b.adults} adulto(s)${b.children ? `, ${b.children} criança(s) de ${b.childrenAges.join(", ") || "?"} anos` : ""}
PERFIL: ${TRAVEL_PROFILES[b.profile].label} — ${TRAVEL_PROFILES[b.profile].idea}
RITMO: ${b.pace}
INTERESSES: ${interestsText(b.interests)}
OCASIÃO: ${b.occasion || "nenhuma"}
NÃO ABRO MÃO (da viagem toda; inclua aqui só os que ficam neste destino e ignore os de outras cidades): ${b.mustHaves.length ? b.mustHaves.join("; ") : "nenhum"}
RESTRIÇÕES: ${JSON.stringify(b.restrictions)}
OBSERVAÇÕES: ${b.notes || "-"}
${ctx.isFirst ? "" : "Chegada vinda do destino anterior no primeiro dia: deixe a manhã do primeiro dia mais leve."}

CANDIDATOS (código | nome | tipo | interesse | preço | horário):
${candidateLines(cands, codes, offset)}`;
  const r = await askJSON({ schema: DestinationPlanSchema, system: SYSTEM, prompt, effort: "medium", maxTokens: 32000 });
  r.data.days.forEach((d) => d.items.forEach((it) => { it.kind = normalizeKind(it.kind); it.options.forEach((o) => { o.profile = normalizeProfile(o.profile); }); }));
  return r;
}

type SavedItem = ScheduleItem & {
  day_date: string;
  kind: string;
  candidate: Candidate | null;
  cost_cents: number;
  must_have: boolean;
  why: string;
  score: number | null;
  interest_category: string | null;
  verified: boolean;
  options: { candidate: Candidate; profile: string; price_cents: number; reason: string; score: number }[];
  start_time?: string;
  travel_min?: number;
};
const ll = (i: { lat?: number | null; lng?: number | null }) => (i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null);

export type GenerationResult = {
  viability: number;
  usage: AIUsage;
  conflicts: number;
  mustHaves: DestinationPlan["must_haves"];
  tips: string[];
  profileTotals: Record<string, number>;
  durationMs: number;
};

/** Gera o roteiro completo de uma viagem e grava dias, itens e opções. Não cobra: quem chama debita o crédito ao final (RN-17). */
export async function generateTrip(supabase: SupabaseClient, tripId: string, userId: string): Promise<GenerationResult> {
  const started = Date.now();
  const { data: trip } = await supabase.from("trips").select("*").eq("id", tripId).single();
  if (!trip) throw new Error("Viagem não encontrada");
  const { data: prefs } = await supabase.from("trip_preferences").select("*").eq("trip_id", tripId).single();
  const { data: dests } = await supabase.from("trip_destinations").select("*").eq("trip_id", tripId).order("position");
  const { data: must } = await supabase.from("trip_must_haves").select("*").eq("trip_id", tripId);
  const { data: profile } = await supabase.from("profiles").select("restrictions").eq("id", userId).single();
  if (!dests?.length || !trip.start_date) throw new Error("Defina destinos e datas antes de gerar");

  const b: TripBriefing = {
    profile: (prefs?.travel_profile ?? "classica") as TravelProfile,
    pace: trip.pace,
    interests: (prefs?.interests as Record<string, number>) ?? {},
    adults: trip.travelers_adults,
    children: trip.travelers_children,
    childrenAges: trip.children_ages ?? [],
    occasion: prefs?.occasion ?? null,
    notes: prefs?.notes ?? null,
    mustHaves: (must ?? []).map((m) => m.original_text),
    budgetCapCents: prefs?.budget_cap_cents ?? null,
    restrictions: (profile?.restrictions as Record<string, unknown>) ?? {},
  };

  // Datas de cada destino em sequência
  let cursor = trip.start_date as string;
  const inputs: DestinationInput[] = dests.map((d) => {
    const days = d.days ?? 1;
    const di = { id: d.id, city: d.city, country: d.country, lat: d.lat, lng: d.lng, start: cursor, days };
    cursor = addDays(cursor, days);
    return di;
  });

  // Candidatos (base própria), clima e feriados em paralelo
  const year = Number(String(trip.start_date).slice(0, 4));
  const [candSets, weathers, hols] = await Promise.all([
    Promise.all(inputs.map((d) => getCandidates(supabase, d.city, d.lat, d.lng, { country: d.country }))),
    Promise.all(inputs.map((d) => weather(d.lat, d.lng, d.start, addDays(d.start, d.days - 1)))),
    Promise.all(inputs.map((d) => holidays(d.country, year))),
  ]);

  const codes = new Map<string, Candidate>();
  let offset = 0;
  const usage: AIUsage = { inputTokens: 0, outputTokens: 0, costCents: 0, ms: 0 };
  const plans = await Promise.all(
    inputs.map((d, i) => {
      const sl = shortlist(candSets[i].candidates, b.interests, b.profile, d.days);
      const myOffset = offset;
      offset += sl.length;
      return planDestination(d, b, sl, codes, myOffset, { weatherByDate: weathers[i], holidaySet: hols[i], isFirst: i === 0 });
    }),
  );
  plans.forEach((p) => {
    usage.inputTokens += p.usage.inputTokens;
    usage.outputTokens += p.usage.outputTokens;
    usage.costCents += p.usage.costCents;
  });

  // Converte e verifica (salvaguarda 9.3: código que não bate com candidato é descartado)
  const legs = transferLegs(inputs.map((d) => ({ id: d.id, city: d.city, lat: d.lat, lng: d.lng })));
  const daysOut: { date: string; destId: string; title: string; items: SavedItem[]; rain: number | null; holiday: boolean }[] = [];
  const usedPlaces = new Set<string>(); // o mesmo lugar não entra duas vezes na viagem
  const usedMust = new Set<string>();
  const key = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\(.*\)/, "").trim();
  const mustHaves: DestinationPlan["must_haves"] = [];
  const tips: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const d = inputs[i];
    const plan = plans[i].data;
    mustHaves.push(...plan.must_haves);
    tips.push(...plan.tips.slice(0, 2));
    const validDates = new Set(Array.from({ length: d.days }, (_, k) => addDays(d.start, k)));
    const planDays = plan.days.filter((x) => validDates.has(x.date));
    // garante todos os dias, mesmo que a IA tenha pulado algum
    for (const dt of validDates) if (!planDays.find((x) => x.date === dt)) planDays.push({ date: dt, title: "Dia livre", items: [] });
    planDays.sort((a, b2) => a.date.localeCompare(b2.date));

    for (const [k, pd] of planDays.entries()) {
      const items: SavedItem[] = [];
      if (k === 0 && i > 0) {
        const leg = legs[i - 1];
        items.push({
          id: crypto.randomUUID(), title: `${inputs[i - 1].city} → ${d.city} (${leg.mode === "aviao" ? "voo" : leg.mode})`, kind: "trajeto", day_date: pd.date,
          lat: inputs[i - 1].lat, lng: inputs[i - 1].lng, duration_min: leg.minutes, transport_mode: leg.mode === "aviao" ? "aviao" : "trem",
          candidate: null, cost_cents: 0, must_have: false, why: `Trecho entre destinos: ${leg.km} km, cerca de ${Math.round(leg.minutes / 6) / 10} h.`, score: null, interest_category: null, verified: true, options: [],
        });
      }
      for (const it of pd.items) {
        const cand = it.candidate ? codes.get(it.candidate) ?? null : null;
        if (it.candidate && !cand) continue; // inventado → descarta
        if (!cand && !it.must_have && !["nota", "livre"].includes(it.kind)) continue;
        if (cand && usedPlaces.has(cand.id)) continue;
        if (it.must_have && usedMust.has(key(cand?.name ?? it.title))) continue;
        if (cand) usedPlaces.add(cand.id);
        if (it.must_have) usedMust.add(key(cand?.name ?? it.title));
        const fit = cand ? fitScore({ interest: cand.interest, interests: b.interests, itemPriceLevel: cand.price_level, profile: b.profile, contextBonus: 0.7 }) : null;
        const quality = cand ? Math.min(10, 4 + cand.notability * 0.6) : null;
        const opts = it.options
          .map((o) => {
            const oc = codes.get(o.candidate);
            if (!oc) return null;
            const oFit = fitScore({ interest: oc.interest, interests: b.interests, itemPriceLevel: oc.price_level, profile: o.profile as TravelProfile, contextBonus: 0.7 });
            return { candidate: oc, profile: o.profile, price_cents: Math.round(o.price_brl * 100), reason: o.reason, score: forYouScore(Math.min(10, 4 + oc.notability * 0.6), oFit) };
          })
          .filter(Boolean) as SavedItem["options"];
        items.push({
          id: crypto.randomUUID(), title: cand?.name ?? it.title, kind: it.kind, day_date: pd.date,
          lat: cand?.lat ?? null, lng: cand?.lng ?? null, duration_min: Math.max(15, Math.min(it.duration_min, 600)),
          anchor: !!it.fixed_time, anchor_time: it.fixed_time, opening_hours: cand?.opening_hours ?? null, outdoor: cand?.outdoor ?? false,
          candidate: cand, cost_cents: Math.round(it.cost_brl * 100), must_have: it.must_have, why: it.why,
          score: quality != null && fit != null ? forYouScore(quality, fit) : null, interest_category: cand?.interest ?? null,
          verified: !!cand, options: opts,
        });
      }
      daysOut.push({ date: pd.date, destId: d.id, title: pd.title, items, rain: weathers[i][pd.date]?.rain ?? null, holiday: hols[i].has(pd.date) });
    }
  }

  // Obrigatórios fora da lista: tenta verificar por geocodificação (senão fica sinalizado como não verificado)
  await Promise.all(
    daysOut.flatMap((day) => day.items.filter((it) => it.must_have && !it.candidate).map(async (it) => {
      const dest = inputs.find((d) => d.id === day.destId);
      const g = await geocode(`${it.title}, ${dest?.city ?? ""}`);
      if (g) { it.lat = g.lat; it.lng = g.lng; it.verified = true; }
    })),
  );

  // Motor de agenda: modo de transporte, otimização (respeitando âncoras) e cascata
  const dayScores: { score: number; items: number }[] = [];
  let conflictsTotal = 0;
  for (const day of daysOut) {
    day.items.forEach((it, idx) => {
      if (idx > 0 && it.kind !== "trajeto") it.transport_mode = suggestMode(ll(day.items[idx - 1]), ll(it), b.profile);
    });
    const ctx = { date: day.date, dayStart: "09:00", pace: b.pace, rainProbability: day.rain, isHoliday: day.holiday };
    const opt = optimizeDay(day.items, ctx);
    if (opt.changed) day.items = opt.items;
    day.items.forEach((it, idx) => {
      if (idx > 0 && it.kind !== "trajeto") it.transport_mode = suggestMode(ll(day.items[idx - 1]), ll(it), b.profile);
    });
    const res = cascade(day.items, ctx);
    dayScores.push({ score: res.score, items: day.items.length });
    conflictsTotal += res.conflicts.length;
    res.items.forEach((ri, idx) => {
      day.items[idx].start_time = ri.start;
      day.items[idx].travel_min = ri.travel_before;
    });
  }
  const viability = tripViability(dayScores);

  // Gravação: apaga o roteiro anterior (ajuste/refazer) e grava o novo
  await supabase.from("itinerary_items").delete().eq("trip_id", tripId).not("day_id", "is", null);
  await supabase.from("days").delete().eq("trip_id", tripId);
  const dayRows = daysOut.map((d, i) => ({ trip_id: tripId, destination_id: d.destId, date: d.date, title: d.title, position: i }));
  const { data: savedDays, error: dErr } = await supabase.from("days").insert(dayRows).select("id, date");
  if (dErr) throw dErr;
  const dayIdByDate = new Map(savedDays!.map((d) => [d.date, d.id]));
  const itemRows = daysOut.flatMap((d) =>
    d.items.map((it, pos) => ({
      id: it.id, trip_id: tripId, day_id: dayIdByDate.get(d.date), kind: it.kind === "trajeto" ? "trajeto" : it.kind, title: it.title,
      place_id: it.candidate?.id ?? null, lat: it.lat, lng: it.lng, category: it.candidate?.category ?? null, interest_category: it.interest_category,
      start_time: it.start_time ?? null, duration_min: it.duration_min, anchor: !!it.anchor, anchor_time: it.anchor_time ?? null,
      transport_mode: it.transport_mode ?? "a_pe", travel_min: it.travel_min ?? null, cost_cents: it.cost_cents, currency: "BRL",
      opening_hours: it.opening_hours ?? null, outdoor: !!it.outdoor, must_have: it.must_have, travel_profile: b.profile, score: it.score, why: it.why,
      verified: it.verified, position: pos, created_by: userId,
    })),
  );
  if (itemRows.length) {
    const { error } = await supabase.from("itinerary_items").insert(itemRows);
    if (error) throw error;
  }
  const optionRows = daysOut.flatMap((d) =>
    d.items.flatMap((it) =>
      it.options.map((o) => ({
        item_id: it.id, title: o.candidate.name, place_id: o.candidate.id, lat: o.candidate.lat, lng: o.candidate.lng, travel_profile: o.profile,
        est_price_cents: o.price_cents, score: o.score, score_quality: Math.min(10, 4 + o.candidate.notability * 0.6), reason: o.reason,
        chosen: o.candidate.id === it.candidate?.id,
      })),
    ),
  );
  if (optionRows.length) await supabase.from("item_options").insert(optionRows);

  // Obrigatórios: atualiza status (RN-20)
  if (must?.length) {
    for (const m of must) {
      const r = mustHaves.find((x) => x.text.toLowerCase().includes(m.original_text.toLowerCase().slice(0, 12)) || m.original_text.toLowerCase().includes(x.text.toLowerCase().slice(0, 12)));
      await supabase.from("trip_must_haves").update({ status: r?.status === "sem_espaco" ? "sem_espaco" : "aplicado" }).eq("id", m.id);
    }
  }

  const profileTotals = computeProfileTotals(daysOut, b, inputs);
  await supabase.from("trips").update({ viability_score: viability, status: trip.status === "rascunho" ? "planejando" : trip.status }).eq("id", tripId);

  return { viability, usage, conflicts: conflictsTotal, mustHaves, tips, profileTotals, durationMs: Date.now() - started };
}

/** RF-192: custo total do mesmo esqueleto nos três perfis. */
function computeProfileTotals(days: { items: SavedItem[] }[], b: TripBriefing, inputs: DestinationInput[]) {
  const people = b.adults + b.children;
  const rooms = Math.max(1, Math.ceil(b.adults / 2));
  const totals: Record<string, number> = { mochilao: 0, classica: 0, experiencia: 0 };
  for (const p of PROFILES) {
    for (const d of days) {
      for (const it of d.items) {
        if (it.kind === "hospedagem") continue;
        const opt = it.options.find((o) => o.profile === p);
        totals[p] += (opt?.price_cents ?? it.cost_cents) * people;
      }
    }
    // hospedagem: preço da opção do perfil × noites × quartos
    for (const dest of inputs) {
      const lodgingItem = days.flatMap((d) => d.items).find((it) => it.kind === "hospedagem" && it.day_date >= dest.start && it.day_date < addDays(dest.start, dest.days));
      const nightly = lodgingItem?.options.find((o) => o.profile === p)?.price_cents ?? lodgingItem?.cost_cents ?? 0;
      totals[p] += nightly * dest.days * rooms;
    }
  }
  return totals;
}

// ---------- Prévia grátis (RF-230): divisão dos dias + destaques, sem APIs pagas ----------
const PreviewSchema = z.object({
  summary: z.string().describe("2 frases com a cara da viagem, na voz do Pino"),
  destinations: z.array(z.object({
    city: z.string().describe("nome do destino exatamente como na lista, sem país"),
    highlights: z.array(z.string()).describe("3 destaques curtos, escolhidos entre os candidatos"),
    why_days: z.string().describe("por que esse número de dias, até 18 palavras"),
    est_daily_brl: z.number().describe("gasto estimado por pessoa por dia no perfil, sem hospedagem"),
    est_nightly_brl: z.number().describe("hospedagem estimada por noite por quarto no perfil"),
  })),
  division_reason: z.string().describe("por que essa ordem e divisão, até 30 palavras"),
});

export async function previewHighlights(b: TripBriefing, dests: { city: string; country: string | null; days: number; candidates: Candidate[] }[]) {
  const prompt = `Perfil ${TRAVEL_PROFILES[b.profile].label}, ritmo ${b.pace}, interesses: ${interestsText(b.interests)}. Ocasião: ${b.occasion || "nenhuma"}. Não abro mão: ${b.mustHaves.join("; ") || "nenhum"}.
Viajantes: ${b.adults} adulto(s), ${b.children} criança(s).
Destinos na ordem, com dias:
${dests.map((d) => `- ${d.city}${d.country ? ` (${d.country})` : ""}: ${d.days} dia(s). Candidatos: ${d.candidates.filter((c) => c.type === "atracao").slice(0, 25).map((c) => c.name).join(", ") || "sem dados ainda"}`).join("\n")}`;
  return askJSON({ schema: PreviewSchema, system: `${PINO_VOICE}\nVocê faz a prévia grátis de um roteiro: só destaques e estimativas, sem detalhar horários. Destaques devem vir da lista de candidatos quando houver.`, prompt, effort: "low", maxTokens: 6000 });
}

export function travelBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return travelMinutes(a, b, "trem");
}

export { fromMin, daysBetween };

// ---------- Refazer um dia (RF-024): refazer, deixar mais leve ou mais barato ----------
export async function redoDay(supabase: SupabaseClient, tripId: string, dayId: string, mode: "refazer" | "leve" | "barato", userId: string) {
  const { data: day } = await supabase.from("days").select("*").eq("id", dayId).eq("trip_id", tripId).single();
  if (!day) throw new Error("Dia não encontrado");
  const [{ data: trip }, { data: prefs }, { data: dest }, { data: current }, { data: others }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("trip_preferences").select("*").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_destinations").select("*").eq("id", day.destination_id).maybeSingle(),
    supabase.from("itinerary_items").select("*").eq("day_id", dayId).order("position"),
    supabase.from("itinerary_items").select("place_id").eq("trip_id", tripId).neq("day_id", dayId),
  ]);
  if (!dest?.lat) throw new Error("Destino sem localização");
  const profile = ((prefs?.travel_profile as TravelProfile) ?? "classica");
  const interests = (prefs?.interests as Record<string, number>) ?? {};
  const used = new Set((others ?? []).map((o) => o.place_id).filter(Boolean));
  const { candidates } = await getCandidates(supabase, dest.city, dest.lat, dest.lng, { country: dest.country });
  const sl = shortlist(candidates.filter((c) => !used.has(c.id)), interests, mode === "barato" ? "mochilao" : profile, 2);
  const codes = new Map<string, Candidate>();
  const keep = (current ?? []).filter((i) => i.anchor || i.must_have || i.kind === "hospedagem" || i.kind === "trajeto");
  const instruction = mode === "leve" ? "Deixe o dia MAIS LEVE: no máximo 3 atividades além das refeições, mais tempo em cada uma." : mode === "barato" ? "Deixe o dia MAIS BARATO: priorize gratuitos e opções do perfil Mochilão." : "Proponha uma versão NOVA e diferente para o dia.";
  const prompt = `DESTINO: ${dest.city}. DATA: ${day.date}. PERFIL: ${TRAVEL_PROFILES[profile].label}. RITMO: ${trip.pace}. INTERESSES: ${interestsText(interests)}.
${instruction}
MANTENHA (não mexa, já estão no dia): ${keep.map((k) => `${k.title}${k.anchor ? ` (fixo ${k.anchor_time})` : ""}`).join("; ") || "nada"}.
ATUAL: ${(current ?? []).map((i) => i.title).join(", ") || "vazio"}.
CANDIDATOS (código | nome | tipo | interesse | preço | horário):
${candidateLines(sl, codes, 0)}`;
  const { data, usage } = await askJSON({ schema: z.object({ day: DaySchema }), system: SYSTEM, prompt, effort: "low", maxTokens: 12000 });
  data.day.items.forEach((it) => { it.kind = normalizeKind(it.kind); });
  const rows = data.day.items
    .map((it) => ({ it, cand: it.candidate ? codes.get(it.candidate) ?? null : null }))
    .filter(({ it, cand }) => cand || ["nota", "livre"].includes(it.kind))
    .filter(({ cand }) => !cand || !keep.some((k) => k.place_id === cand.id));
  // apaga os itens não travados e grava os novos depois dos mantidos
  const removable = (current ?? []).filter((i) => !keep.includes(i)).map((i) => i.id);
  if (removable.length) await supabase.from("itinerary_items").delete().in("id", removable);
  const all: ScheduleItem[] = [
    ...keep.map((k) => ({ ...k })),
    ...rows.map(({ it, cand }) => ({
      id: crypto.randomUUID(), title: cand?.name ?? it.title, kind: it.kind, lat: cand?.lat ?? null, lng: cand?.lng ?? null, duration_min: Math.max(15, Math.min(600, it.duration_min)),
      anchor: false, anchor_time: null, opening_hours: cand?.opening_hours ?? null, outdoor: cand?.outdoor ?? false, cost_cents: Math.round(it.cost_brl * 100),
      _cand: cand, _why: it.why,
    })),
  ];
  all.forEach((it, idx) => { if (idx > 0 && it.kind !== "trajeto") it.transport_mode = suggestMode(ll(all[idx - 1]), ll(it), profile); });
  const opt = optimizeDay(all, { date: day.date, dayStart: day.day_start || "09:00", pace: trip.pace });
  const ordered = opt.changed ? opt.items : all;
  const res = cascade(ordered, { date: day.date, dayStart: day.day_start || "09:00", pace: trip.pace });
  for (const [idx, it] of ordered.entries()) {
    const r = res.items[idx];
    const extra = it as ScheduleItem & { _cand?: Candidate | null; _why?: string };
    if (keep.some((k) => k.id === it.id)) {
      await supabase.from("itinerary_items").update({ position: idx, start_time: r.start, travel_min: r.travel_before }).eq("id", it.id);
    } else {
      const cand = extra._cand ?? null;
      const fit = cand ? fitScore({ interest: cand.interest, interests, itemPriceLevel: cand.price_level, profile, contextBonus: 0.7 }) : null;
      await supabase.from("itinerary_items").insert({
        id: it.id, trip_id: tripId, day_id: dayId, kind: it.kind, title: it.title, place_id: cand?.id ?? null, lat: it.lat, lng: it.lng, category: cand?.category ?? null,
        interest_category: cand?.interest ?? null, start_time: r.start, travel_min: r.travel_before, duration_min: it.duration_min, transport_mode: it.transport_mode ?? "a_pe",
        cost_cents: it.cost_cents ?? 0, opening_hours: it.opening_hours, outdoor: !!it.outdoor, travel_profile: profile,
        score: cand && fit != null ? forYouScore(Math.min(10, 4 + cand.notability * 0.6), fit) : null, why: extra._why ?? null, verified: !!cand, position: idx, created_by: userId,
      });
    }
  }
  await supabase.from("days").update({ title: data.day.title }).eq("id", dayId);
  return { usage, score: res.score, title: data.day.title };
}
