// Motor de agenda (seção 8 do escopo): cascata com âncoras, otimização da ordem, conflitos e score de viabilidade.
import { travelMinutes, haversineKm, type TransportMode, type LatLng } from "./geo";
import { fromMin, toMin } from "./time";
import { isOpenDuring } from "./opening-hours";

export type ScheduleItem = {
  id: string;
  title: string;
  kind?: string;
  lat?: number | null;
  lng?: number | null;
  duration_min: number;
  anchor?: boolean;
  anchor_time?: string | null;
  transport_mode?: string | null;
  opening_hours?: string | null;
  outdoor?: boolean;
  cost_cents?: number | null;
};

export type Severity = "alta" | "media" | "baixa";
export type ConflictType = "fechado" | "nao_da_tempo" | "sobreposicao" | "ancora_risco" | "dia_puxado" | "clima" | "orcamento";

export type Conflict = {
  type: ConflictType;
  severity: Severity;
  itemId?: string;
  message: string;
  fix: string;
};

export type ComputedItem<T extends ScheduleItem = ScheduleItem> = T & {
  start: string;
  end: string;
  travel_before: number;
};

export type DayContext = {
  date?: string | null;
  dayStart?: string;
  pace?: "leve" | "equilibrado" | "intenso" | string;
  isHoliday?: boolean;
  rainProbability?: number | null; // 0-100
  dailyBudgetCents?: number | null;
};

const PACE_LIMITS: Record<string, { activeMin: number; walkKm: number }> = {
  leve: { activeMin: 7 * 60, walkKm: 6 },
  equilibrado: { activeMin: 9 * 60, walkKm: 10 },
  intenso: { activeMin: 11 * 60, walkKm: 15 },
};

const SEVERITY_PENALTY: Record<Severity, number> = { alta: 15, media: 6, baixa: 2 };

function coords(i: ScheduleItem): LatLng | null {
  return i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null;
}

function legMinutes(prev: ScheduleItem | undefined, next: ScheduleItem): number {
  if (!prev) return 0;
  const a = coords(prev);
  const b = coords(next);
  if (!a || !b) return 0;
  return travelMinutes(a, b, (next.transport_mode as TransportMode) || "a_pe");
}

export type CascadeResult<T extends ScheduleItem> = {
  items: ComputedItem<T>[];
  conflicts: Conflict[];
  freeBlocks: { after: string | null; start: string; end: string; minutes: number }[];
  activeMinutes: number;
  travelMinutes: number;
  walkKm: number;
  costCents: number;
  score: number;
};

/** 8.1 Cascata: cada item começa no fim do anterior + deslocamento; âncoras nunca se movem (RN-02). */
export function cascade<T extends ScheduleItem>(items: T[], ctx: DayContext = {}): CascadeResult<T> {
  const dayStart = toMin(ctx.dayStart || "09:00") ?? 540;
  const out: ComputedItem<T>[] = [];
  const conflicts: Conflict[] = [];
  const freeBlocks: CascadeResult<T>["freeBlocks"] = [];
  let cur = dayStart;
  let travelTotal = 0;
  let walkKm = 0;
  let active = 0;
  let cost = 0;

  items.forEach((item, idx) => {
    const prev = items[idx - 1];
    const travel = legMinutes(prev, item);
    if (prev && (item.transport_mode || "a_pe") === "a_pe") {
      const a = coords(prev), b = coords(item);
      if (a && b) walkKm += haversineKm(a, b) * 1.3;
    }
    travelTotal += travel;
    const arrival = idx === 0 ? cur : cur + travel;
    let start = arrival;

    if (item.anchor && toMin(item.anchor_time) != null) {
      const fixed = toMin(item.anchor_time)!;
      if (idx > 0 && cur > fixed) {
        conflicts.push({
          type: "sobreposicao", severity: "alta", itemId: item.id,
          message: `"${prev.title}" termina às ${fromMin(cur)}, depois do horário fixo de "${item.title}" (${item.anchor_time}).`,
          fix: `Encurte ou mova itens antes de ${item.anchor_time}.`,
        });
      } else if (idx > 0 && arrival > fixed) {
        conflicts.push({
          type: "nao_da_tempo", severity: "alta", itemId: item.id,
          message: `Não dá tempo de chegar a "${item.title}" às ${item.anchor_time}: chegada prevista ${fromMin(arrival)}.`,
          fix: `Tire ou encurte algo antes, ou troque o transporte.`,
        });
      } else if (idx > 0 && fixed - arrival < 30 && ["trajeto", "hospedagem"].includes(item.kind || "") ) {
        conflicts.push({
          type: "ancora_risco", severity: "media", itemId: item.id,
          message: `Folga de só ${fixed - arrival} min antes de "${item.title}".`,
          fix: "Deixe pelo menos 30 min de margem antes de voos, trens e ingressos.",
        });
      }
      if (idx > 0 && fixed - arrival >= 20) {
        freeBlocks.push({ after: prev.id, start: fromMin(arrival), end: fromMin(fixed), minutes: fixed - arrival });
      }
      start = fixed;
    } else if (idx === 0) {
      start = dayStart;
    }

    const end = start + item.duration_min;
    if (!item.anchor && item.opening_hours) {
      const open = isOpenDuring(item.opening_hours, ctx.date ?? null, start, end, ctx.isHoliday);
      if (open === false) {
        conflicts.push({
          type: "fechado", severity: "alta", itemId: item.id,
          message: `"${item.title}" pode estar fechado entre ${fromMin(start)} e ${fromMin(end)} (horário: ${item.opening_hours}).`,
          fix: "Mude o item de horário ou de dia.",
        });
      }
    }
    if (item.outdoor && (ctx.rainProbability ?? 0) > 70) {
      conflicts.push({
        type: "clima", severity: "media", itemId: item.id,
        message: `Previsão de chuva de ${ctx.rainProbability}% para "${item.title}", ao ar livre.`,
        fix: "Troque por uma atividade coberta ou mude de dia.",
      });
    }
    if (!["nota", "livre", "hospedagem"].includes(item.kind || "")) active += item.duration_min;
    cost += item.cost_cents ?? 0;
    out.push({ ...item, start: fromMin(start), end: fromMin(end), travel_before: idx === 0 ? 0 : travel });
    cur = end;
  });

  active += travelTotal;
  const limits = PACE_LIMITS[ctx.pace || "equilibrado"] ?? PACE_LIMITS.equilibrado;
  if (active > limits.activeMin) {
    conflicts.push({
      type: "dia_puxado", severity: "media",
      message: `Dia puxado: ${Math.round(active / 6) / 10} h ativas, acima do ritmo ${ctx.pace || "equilibrado"}.`,
      fix: "Peça ao Pino para deixar o dia mais leve ou mova um item para a lista de ideias.",
    });
  } else if (walkKm > limits.walkKm) {
    conflicts.push({
      type: "dia_puxado", severity: "media",
      message: `${walkKm.toFixed(1)} km a pé, acima do ritmo escolhido.`,
      fix: "Use transporte em algum trecho.",
    });
  }
  if (ctx.dailyBudgetCents && cost > ctx.dailyBudgetCents) {
    conflicts.push({
      type: "orcamento", severity: "baixa",
      message: `Custo previsto do dia acima da média planejada.`,
      fix: "Troque um item por uma opção do perfil Mochilão.",
    });
  }

  return { items: out, conflicts, freeBlocks, activeMinutes: active, travelMinutes: travelTotal, walkKm, costCents: cost, score: viabilityScore(conflicts) };
}

/** 8.4 Score de viabilidade: 100 − 15 por alta − 6 por média − 2 por baixa, mínimo 0. */
export function viabilityScore(conflicts: Conflict[]): number {
  return Math.max(0, 100 - conflicts.reduce((s, c) => s + SEVERITY_PENALTY[c.severity], 0));
}

function pathCost(seq: ScheduleItem[]): number {
  let total = 0;
  for (let i = 1; i < seq.length; i++) total += legMinutes(seq[i - 1], seq[i]);
  return total;
}

/** Ordena um trecho livre com endpoints fixos: vizinho mais próximo + 2-opt. */
function optimizeSegment(start: ScheduleItem | undefined, free: ScheduleItem[], end: ScheduleItem | undefined): ScheduleItem[] {
  if (free.length < 2) return free;
  const remaining = [...free];
  const route: ScheduleItem[] = [];
  let cursor = start;
  if (!cursor) {
    // sem ponto de partida: começa pelo item mais "na ponta" (o mais distante do centro)
    route.push(remaining.shift()!);
    cursor = route[0];
  }
  while (remaining.length) {
    let best = 0;
    let bestCost = Infinity;
    remaining.forEach((c, i) => {
      const cost = legMinutes(cursor, c);
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    cursor = remaining.splice(best, 1)[0];
    route.push(cursor);
  }
  const full = (r: ScheduleItem[]) => [...(start ? [start] : []), ...r, ...(end ? [end] : [])];
  let improved = true;
  let bestRoute = route;
  let bestCost = pathCost(full(route));
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < bestRoute.length - 1; i++) {
      for (let k = i + 1; k < bestRoute.length; k++) {
        const candidate = [...bestRoute.slice(0, i), ...bestRoute.slice(i, k + 1).reverse(), ...bestRoute.slice(k + 1)];
        const c = pathCost(full(candidate));
        if (c < bestCost - 0.5) { bestCost = c; bestRoute = candidate; improved = true; }
      }
    }
  }
  return bestRoute;
}

export type OptimizeResult<T extends ScheduleItem> = { items: T[]; savedMinutes: number; changed: boolean };

/** 8.2 Otimização: âncoras e hospedagem ficam travadas no lugar; só aceita se não piorar conflitos de severidade alta. */
export function optimizeDay<T extends ScheduleItem>(items: T[], ctx: DayContext = {}): OptimizeResult<T> {
  const isFixed = (i: ScheduleItem, idx: number) => !!i.anchor || (i.kind === "hospedagem" && (idx === 0 || idx === items.length - 1));
  const result: T[] = [];
  let segment: T[] = [];
  let lastFixed: T | undefined;
  items.forEach((item, idx) => {
    if (isFixed(item, idx)) {
      result.push(...(optimizeSegment(lastFixed, segment, item) as T[]), item);
      segment = [];
      lastFixed = item;
    } else {
      segment.push(item);
    }
  });
  result.push(...(optimizeSegment(lastFixed, segment, undefined) as T[]));

  const before = cascade(items, ctx);
  const after = cascade(result, ctx);
  const highs = (r: CascadeResult<T>) => r.conflicts.filter((c) => c.severity === "alta").length;
  const saved = before.travelMinutes - after.travelMinutes;
  const changed = result.some((it, i) => it.id !== items[i].id);
  if (!changed || saved <= 0 || highs(after) > highs(before)) {
    return { items, savedMinutes: 0, changed: false };
  }
  return { items: result, savedMinutes: saved, changed: true };
}

/** Score da viagem inteira: média dos dias ponderada pela quantidade de itens. */
export function tripViability(dayScores: { score: number; items: number }[]): number {
  const withItems = dayScores.filter((d) => d.items > 0);
  if (!withItems.length) return 100;
  const total = withItems.reduce((s, d) => s + d.items, 0);
  return Math.round(withItems.reduce((s, d) => s + d.score * d.items, 0) / total);
}
