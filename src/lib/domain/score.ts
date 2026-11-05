// Curadoria e score "para você" (M23, seção 10.3 e 10.4).

export const INTEREST_CATEGORIES = [
  { id: "natureza", label: "Natureza e aventura", icon: "Mountain" },
  { id: "cultura", label: "Cultura e história", icon: "Landmark" },
  { id: "gastronomia", label: "Gastronomia", icon: "UtensilsCrossed" },
  { id: "praia", label: "Praia e relax", icon: "Waves" },
  { id: "noite", label: "Vida noturna", icon: "Martini" },
  { id: "compras", label: "Compras", icon: "ShoppingBag" },
  { id: "bem_estar", label: "Bem-estar", icon: "Heart" },
  { id: "arte", label: "Arte e música", icon: "Music" },
  { id: "local", label: "Viver como local", icon: "Home" },
  { id: "fotografia", label: "Fotografia e mirantes", icon: "Camera" },
] as const;
export type InterestId = (typeof INTEREST_CATEGORIES)[number]["id"];
export const WEIGHT_LABELS: Record<number, string> = { 1: "Gosto", 2: "Curto muito", 3: "Amo" };

export const TRAVEL_PROFILES = {
  mochilao: { label: "Mochilão", idea: "Gastar pouco e aproveitar muito", priceLevel: 1, pace: "intenso" },
  classica: { label: "Clássica", idea: "Conforto com bom custo-benefício", priceLevel: 2, pace: "equilibrado" },
  experiencia: { label: "Experiência", idea: "Viver algo marcante e diferente", priceLevel: 3, pace: "leve" },
} as const;
export type TravelProfile = keyof typeof TRAVEL_PROFILES;

export type PlaceType = "hospedagem" | "restaurante" | "atracao" | "experiencia";

/** 10.3 Filtro de qualidade: nota mínima e volume mínimo por tipo. */
export const QUALITY_RULES: Record<PlaceType, { minRating: number; minReviews: number }> = {
  hospedagem: { minRating: 4.0, minReviews: 100 },
  restaurante: { minRating: 4.2, minReviews: 80 },
  atracao: { minRating: 4.3, minReviews: 200 },
  experiencia: { minRating: 4.5, minReviews: 30 },
};

export type QualityInput = {
  type: PlaceType;
  rating?: number | null;
  reviews?: number | null;
  recentRating?: number | null; // últimos 12 meses
  monthsSinceLastReview?: number | null;
  operational?: boolean;
  seriousComplaints?: number; // menções a sujeira, golpe, insegurança…
  hostel?: boolean;
  profile?: TravelProfile;
  ownRating?: number | null;
  ownReviews?: number | null;
};

export type QualityVerdict = { approved: boolean; unverified: boolean; reasons: string[] };

export function qualityFilter(q: QualityInput): QualityVerdict {
  const reasons: string[] = [];
  if (q.operational === false) return { approved: false, unverified: false, reasons: ["fechado"] };
  if ((q.seriousComplaints ?? 0) > 1) return { approved: false, unverified: false, reasons: ["reclamações graves recorrentes"] };
  if (q.rating == null || q.reviews == null) {
    return { approved: true, unverified: true, reasons: ["sem avaliações verificadas"] };
  }
  let rule = QUALITY_RULES[q.type];
  if (q.type === "hospedagem" && q.hostel && q.profile === "mochilao") rule = { minRating: 4.2, minReviews: 50 };
  if (q.rating < rule.minRating) reasons.push(`nota ${q.rating} abaixo de ${rule.minRating}`);
  if (q.reviews < rule.minReviews) reasons.push(`${q.reviews} avaliações, mínimo ${rule.minReviews}`);
  const unverified = (q.monthsSinceLastReview ?? 0) > 6;
  return { approved: reasons.length === 0, unverified, reasons };
}

/** Média bayesiana com referência de 50 avaliações; converte 3,0–5,0 em 0–10. */
export function qualityScore(q: QualityInput, prior = 4.2): number {
  if (q.rating == null) {
    if (q.ownRating != null && (q.ownReviews ?? 0) >= 10) return clamp(((q.ownRating - 3) / 2) * 10, 0, 10);
    return 6; // sem dados: neutro, marcado como "não verificado"
  }
  const n = q.reviews ?? 0;
  let r = (q.rating * n + prior * 50) / (n + 50);
  if (q.recentRating != null && q.rating - q.recentRating >= 0.3) r -= 0.15; // queda recente
  if (q.ownRating != null && (q.ownReviews ?? 0) >= 10) r = (r * 2 + q.ownRating) / 3;
  return round1(clamp(((r - 3) / 2) * 10, 0, 10));
}

export type FitInput = {
  interest?: string | null;
  interests: Record<string, number>; // categoria → peso 1..3
  itemPriceLevel?: number | null; // 1..3
  profile: TravelProfile;
  contextBonus?: number; // 0..1 (ocasião, crianças, clima, distância)
};

const INTEREST_FIT: Record<number, number> = { 3: 1.0, 2: 0.7, 1: 0.4 };

export function fitScore(f: FitInput): number {
  const w = f.interest ? f.interests[f.interest] : undefined;
  const interestPart = w ? INTEREST_FIT[w] ?? 0.1 : 0.1;
  const target = TRAVEL_PROFILES[f.profile].priceLevel;
  const diff = f.itemPriceLevel == null ? 0 : Math.abs(f.itemPriceLevel - target);
  const pricePart = diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
  const ctx = f.contextBonus ?? 0.6;
  return round1((0.5 * interestPart + 0.3 * pricePart + 0.2 * ctx) * 10);
}

/** Score = 0,5 × Qualidade + 0,5 × Compatibilidade (0 a 10). */
export function forYouScore(quality: number, fit: number): number {
  return round1(0.5 * quality + 0.5 * fit);
}

export function badge(score: number | null | undefined): { label: string; tone: "top" | "good" | "ok" } | null {
  if (score == null) return null;
  if (score >= 9) return { label: "Imperdível", tone: "top" };
  if (score >= 7) return { label: "Muito bom", tone: "good" };
  if (score >= 5) return { label: "Bom", tone: "ok" };
  return null; // abaixo de 5 não é sugerido
}

export function explainScore(args: { quality: number; fit: number; interestLabel?: string; weight?: number; profileLabel: string; inBudget: boolean }): string {
  const parts: string[] = [];
  parts.push(args.quality >= 8 ? "ótimas avaliações" : args.quality >= 6 ? "boas avaliações" : "avaliações medianas");
  if (args.interestLabel && args.weight) parts.push(`é ${args.interestLabel.toLowerCase()}, que você ${args.weight === 3 ? "ama" : args.weight === 2 ? "curte muito" : "gosta"}`);
  parts.push(args.inBudget ? `cabe no ${args.profileLabel}` : `fora da faixa do ${args.profileLabel}`);
  return parts.join(", ");
}

/** 10.2: divide o tempo livre entre categorias na proporção dos pesos. */
export function interestTimeShare(interests: Record<string, number>): { id: string; pct: number }[] {
  const entries = Object.entries(interests).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (!sum) return [];
  const raw = entries.map(([id, w]) => ({ id, pct: (w / sum) * 100 }));
  const rounded = raw.map((r) => ({ id: r.id, pct: Math.floor(r.pct) }));
  let rest = 100 - rounded.reduce((s, r) => s + r.pct, 0);
  raw
    .map((r, i) => ({ i, frac: r.pct - Math.floor(r.pct) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => { if (rest > 0) { rounded[i].pct++; rest--; } });
  return rounded.sort((a, b) => b.pct - a.pct);
}

function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }
function round1(v: number) { return Math.round(v * 10) / 10; }
