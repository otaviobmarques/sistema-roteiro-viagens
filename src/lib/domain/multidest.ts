// Multidestino (M25, seção 10.7): ordem sem voltar para trás e divisão dos dias.
import { haversineKm, type LatLng } from "./geo";

export type Destination = {
  id: string;
  city: string;
  country?: string | null;
  lat: number;
  lng: number;
  capital?: boolean;
  weight?: number; // atratividade pelos interesses (lugares aprovados que combinam)
  locked?: boolean;
  days?: number;
};

/** Ordem que minimiza deslocamento: começa na chegada, termina na saída; vizinho mais próximo + 2-opt. */
export function orderDestinations(dests: Destination[], arrival?: LatLng | null, departure?: LatLng | null): Destination[] {
  if (dests.length < 3 && !arrival && !departure) return dests;
  const remaining = [...dests];
  const route: Destination[] = [];
  let cursor: LatLng | null = arrival ?? null;
  if (!cursor) {
    // sem chegada definida: começa pelo destino mais distante da saída (ou do centro)
    const ref = departure ?? centroid(dests);
    remaining.sort((a, b) => haversineKm(b, ref) - haversineKm(a, ref));
    cursor = remaining[0];
  }
  while (remaining.length) {
    let best = 0, bestD = Infinity;
    remaining.forEach((d, i) => { const k = haversineKm(cursor!, d); if (k < bestD) { bestD = k; best = i; } });
    const next = remaining.splice(best, 1)[0];
    route.push(next);
    cursor = next;
  }
  const cost = (r: Destination[]) => {
    let c = arrival ? haversineKm(arrival, r[0]) : 0;
    for (let i = 1; i < r.length; i++) c += haversineKm(r[i - 1], r[i]);
    if (departure) c += haversineKm(r[r.length - 1], departure);
    return c;
  };
  let best = route, bestC = cost(route), improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++)
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const c = cost(cand);
        if (c < bestC - 0.01) { best = cand; bestC = c; improved = true; }
      }
  }
  return best;
}

function centroid(ds: LatLng[]): LatLng {
  return { lat: ds.reduce((s, d) => s + d.lat, 0) / ds.length, lng: ds.reduce((s, d) => s + d.lng, 0) / ds.length };
}

/** Dias de deslocamento entre destinos: trechos longos consomem meio dia (contado ao reequilibrar). */
export function transferLegs(route: Destination[]): { from: string; to: string; km: number; mode: "trem" | "onibus" | "aviao"; minutes: number }[] {
  const legs = [];
  for (let i = 1; i < route.length; i++) {
    const km = haversineKm(route[i - 1], route[i]);
    const mode = km > 700 ? "aviao" : km > 60 ? "trem" : "onibus";
    const minutes = mode === "aviao" ? Math.round(km / 650 * 60 + 150) : mode === "trem" ? Math.round(km / 110 * 60 + 30) : Math.round(km / 60 * 60 + 20);
    legs.push({ from: route[i - 1].id, to: route[i].id, km: Math.round(km), mode, minutes } as const);
  }
  return legs;
}

/**
 * Divide o total de dias: mínimo por cidade (2 para capitais, 1 para as demais), respeita travados
 * e distribui o resto pelo peso (método dos maiores restos).
 */
export function allocateDays(dests: Destination[], totalDays: number): Destination[] {
  const locked = dests.filter((d) => d.locked && d.days != null);
  const free = dests.filter((d) => !(d.locked && d.days != null));
  const lockedSum = locked.reduce((s, d) => s + (d.days ?? 0), 0);
  let available = Math.max(0, totalDays - lockedSum);
  const mins = free.map((d) => Math.min(d.capital ? 2 : 1, available));
  const minSum = mins.reduce((a, b) => a + b, 0);
  if (minSum > available) {
    // não cabe o mínimo: 1 dia por destino até acabar
    const res = free.map((d, i) => ({ ...d, days: i < available ? 1 : 0 }));
    return dests.map((d) => res.find((r) => r.id === d.id) ?? d);
  }
  available -= minSum;
  const weights = free.map((d) => Math.max(0.1, d.weight ?? 1));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (available * w) / wSum);
  const base = raw.map(Math.floor);
  let rest = available - base.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f).forEach(({ i }) => { if (rest > 0) { base[i]++; rest--; } });
  const res = free.map((d, i) => ({ ...d, days: mins[i] + base[i] }));
  return dests.map((d) => res.find((r) => r.id === d.id) ?? d);
}

/** Ajuste manual (+/−) de um destino: reequilibra os outros não travados mantendo o total. */
export function adjustDays(dests: Destination[], id: string, delta: number, totalDays: number): Destination[] {
  const target = dests.find((d) => d.id === id);
  if (!target) return dests;
  const newDays = Math.max(1, (target.days ?? 1) + delta);
  const others = dests.filter((d) => d.id !== id && !d.locked);
  let diff = newDays - (target.days ?? 1);
  if (!others.length && diff !== 0) return dests;
  const updated = dests.map((d) => ({ ...d }));
  const t = updated.find((d) => d.id === id)!;
  t.days = newDays;
  // tira (ou devolve) dos outros, começando pelos de mais dias
  const pool = updated.filter((d) => d.id !== id && !d.locked).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  let guard = 100;
  while (diff !== 0 && guard-- > 0) {
    const candidate = diff > 0 ? pool.find((d) => (d.days ?? 0) > 1) : pool[pool.length - 1];
    if (!candidate) { t.days! -= diff; break; }
    candidate.days = (candidate.days ?? 0) + (diff > 0 ? -1 : 1);
    diff += diff > 0 ? -1 : 1;
    pool.sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  }
  const sum = updated.reduce((s, d) => s + (d.days ?? 0), 0);
  if (sum !== totalDays) return dests;
  return updated;
}
