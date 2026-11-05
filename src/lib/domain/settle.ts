// Divisão de gastos e acerto simplificado (M08, RN-04, RN-05). Tudo em centavos inteiros.

export type Share = { memberId: string; cents: number };

/** Divide igualmente; a sobra de arredondamento vai para quem pagou (RN-05), ou para o primeiro. */
export function splitEqual(totalCents: number, memberIds: string[], payerId?: string): Share[] {
  if (!memberIds.length) return [];
  const base = Math.floor(totalCents / memberIds.length);
  let rest = totalCents - base * memberIds.length;
  const target = payerId && memberIds.includes(payerId) ? payerId : memberIds[0];
  return memberIds.map((id) => {
    let cents = base;
    if (id === target) { cents += rest; rest = 0; }
    return { memberId: id, cents };
  });
}

/** Divide por cotas (pesos). */
export function splitByWeights(totalCents: number, weights: { memberId: string; weight: number }[], payerId?: string): Share[] {
  const sum = weights.reduce((s, w) => s + w.weight, 0);
  if (sum <= 0) return [];
  const shares = weights.map((w) => ({ memberId: w.memberId, cents: Math.floor((totalCents * w.weight) / sum) }));
  const diff = totalCents - shares.reduce((s, x) => s + x.cents, 0);
  const t = shares.find((s) => s.memberId === payerId) ?? shares[0];
  t.cents += diff;
  return shares;
}

export function validateShares(totalCents: number, shares: Share[]): boolean {
  return shares.reduce((s, x) => s + x.cents, 0) === totalCents && shares.every((s) => s.cents >= 0);
}

export type ExpenseForBalance = { payers: Share[]; shares: Share[] };

/** Saldo de cada pessoa: positivo = tem a receber; negativo = deve. */
export function balances(expenses: ExpenseForBalance[], settlements: { from: string; to: string; cents: number }[] = []): Map<string, number> {
  const b = new Map<string, number>();
  const add = (id: string, v: number) => b.set(id, (b.get(id) ?? 0) + v);
  for (const e of expenses) {
    for (const p of e.payers) add(p.memberId, p.cents);
    for (const s of e.shares) add(s.memberId, -s.cents);
  }
  for (const s of settlements) { add(s.from, s.cents); add(s.to, -s.cents); }
  return b;
}

export type Transfer = { from: string; to: string; cents: number };

/** RF-074: minimiza o número de transferências (guloso maior devedor ↔ maior credor). */
export function minimizeTransfers(bal: Map<string, number>): Transfer[] {
  const debtors = [...bal].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...bal].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: Transfer[] = [];
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, cents: pay });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

/** Converte para real com cotação congelada (RN-04). */
export function toBrlCents(amountCents: number, fxRate: number): number {
  return Math.round(amountCents * fxRate);
}

export function fmtBRL(cents: number | null | undefined, opts: { compact?: boolean } = {}): string {
  const v = (cents ?? 0) / 100;
  if (opts.compact && Math.abs(v) >= 1000) {
    return "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtMoney(cents: number | null | undefined, currency = "BRL"): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency });
}

export function parseMoneyToCents(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
