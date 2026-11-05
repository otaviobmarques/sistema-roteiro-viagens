// Leitor simplificado do formato opening_hours do OpenStreetMap.
// Cobre os casos comuns: "24/7", "Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off", "Tu-Su 10:00-17:30", "PH off".
import { toMin, weekday } from "./time";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Rule = { days: Set<number>; ranges: [number, number][]; off: boolean; holiday: boolean };

function expandDays(spec: string): { days: Set<number>; holiday: boolean } {
  const days = new Set<number>();
  let holiday = false;
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (p === "PH") { holiday = true; continue; }
    const range = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(p);
    if (range) {
      let i = DAYS.indexOf(range[1]);
      const j = DAYS.indexOf(range[2]);
      if (i < 0 || j < 0) continue;
      for (let k = 0; k < 7; k++) { days.add(i); if (i === j) break; i = (i + 1) % 7; }
      continue;
    }
    const idx = DAYS.indexOf(p);
    if (idx >= 0) days.add(idx);
  }
  return { days, holiday };
}

function parse(oh: string): Rule[] | "always" | null {
  const s = oh.trim();
  if (!s) return null;
  if (s === "24/7") return "always";
  const rules: Rule[] = [];
  for (const raw of s.split(";")) {
    const r = raw.trim();
    if (!r) continue;
    const m = /^((?:PH|[A-Z][a-z])(?:[-,](?:PH|[A-Z][a-z]))*)?\s*(.*)$/.exec(r);
    if (!m) return null;
    const { days, holiday } = m[1] ? expandDays(m[1]) : { days: new Set([0, 1, 2, 3, 4, 5, 6]), holiday: false };
    const rest = (m[2] || "").trim();
    if (rest === "off" || rest === "closed") { rules.push({ days, ranges: [], off: true, holiday }); continue; }
    const ranges: [number, number][] = [];
    for (const t of rest.split(",")) {
      const tm = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\+?$/.exec(t.trim());
      if (!tm) return null; // formato não suportado → desconhecido
      const a = toMin(tm[1])!;
      let b = toMin(tm[2])!;
      if (b <= a) b += 24 * 60;
      ranges.push([a, b]);
    }
    rules.push({ days, ranges, off: false, holiday });
  }
  return rules;
}

/**
 * true = aberto em todo o intervalo; false = fechado em parte dele; null = não sabemos.
 */
export function isOpenDuring(oh: string | null | undefined, dateIso: string | null, startMin: number, endMin: number, isHoliday = false): boolean | null {
  if (!oh || !dateIso) return null;
  const rules = parse(oh);
  if (rules === null) return null;
  if (rules === "always") return true;
  const wd = weekday(dateIso);
  let applicable: Rule | null = null;
  for (const r of rules) {
    if (isHoliday && r.holiday) applicable = r;
    else if (r.days.has(wd) && !(isHoliday && rules.some((x) => x.holiday))) applicable = r; // regras posteriores sobrescrevem
  }
  if (!applicable) return false;
  if (applicable.off) return false;
  return applicable.ranges.some(([a, b]) => startMin >= a && endMin <= b);
}

export function closingTime(oh: string | null | undefined, dateIso: string | null): number | null {
  if (!oh || !dateIso) return null;
  const rules = parse(oh);
  if (!rules || rules === "always") return null;
  const wd = weekday(dateIso);
  let applicable: Rule | null = null;
  for (const r of rules) if (r.days.has(wd)) applicable = r;
  if (!applicable || applicable.off || !applicable.ranges.length) return null;
  return Math.max(...applicable.ranges.map((r) => r[1]));
}
