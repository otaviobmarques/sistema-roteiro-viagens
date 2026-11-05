"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, QrCode, ArrowRight, Wallet, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { balances, minimizeTransfers, splitEqual, splitByWeights, fmtBRL, fmtMoney, parseMoneyToCents, type Share, type Transfer } from "@/lib/domain/settle";
import { memberName, type Member, type Trip, type Expense } from "@/lib/types";
import { Avatar, EmptyState, Notice, Pill, Stat } from "@/components/ui";
import { PixSettleModal } from "./pix-settle";

export type ExpenseFull = Expense & {
  expense_payers: { member_id: string; amount_cents: number }[];
  expense_shares: { member_id: string; amount_cents: number }[];
};
export type SettlementRow = { id: string; trip_id: string; from_member: string; to_member: string; amount_cents: number; method: string; paid_at: string | null; created_at: string };

export const EXPENSE_CATEGORIES = [
  { id: "hospedagem", label: "Hospedagem", color: "#205BFF" },
  { id: "transporte", label: "Transporte", color: "#11C2C8" },
  { id: "alimentacao", label: "Alimentação", color: "#F59E0B" },
  { id: "passeios", label: "Passeios e ingressos", color: "#7B61FF" },
  { id: "compras", label: "Compras", color: "#E0567A" },
  { id: "outros", label: "Outros", color: "#8A92A6" },
];
const CURRENCIES = ["BRL", "EUR", "USD", "GBP", "CHF", "ARS", "CLP", "UYU", "MXN", "PEN", "COP", "JPY"];
const catLabel = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function ExpensesClient({ trip, members, meId, canWrite, initialExpenses, initialSettlements }: {
  trip: Trip; members: Member[]; meId: string | null; canWrite: boolean; initialExpenses: ExpenseFull[]; initialSettlements: SettlementRow[];
}) {
  const supabase = supabaseBrowser();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [settlements, setSettlements] = useState(initialSettlements);
  const [showForm, setShowForm] = useState(false);
  const [pix, setPix] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from("expenses").select("*, expense_payers(member_id, amount_cents), expense_shares(member_id, amount_cents)").eq("trip_id", trip.id).order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("settlements").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
    ]);
    setExpenses((e ?? []) as ExpenseFull[]);
    setSettlements((s ?? []) as SettlementRow[]);
  };

  const total = expenses.reduce((s, e) => s + e.amount_brl_cents, 0);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount_brl_cents));
    return EXPENSE_CATEGORIES.map((c) => ({ ...c, cents: m.get(c.id) ?? 0 })).filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
  }, [expenses]);

  const paid = settlements.filter((s) => s.paid_at);
  const bal = useMemo(() => balances(
    expenses.map((e) => ({ payers: e.expense_payers.map((p) => ({ memberId: p.member_id, cents: p.amount_cents })), shares: e.expense_shares.map((p) => ({ memberId: p.member_id, cents: p.amount_cents })) })),
    paid.map((s) => ({ from: s.from_member, to: s.to_member, cents: s.amount_cents })),
  ), [expenses, paid]);
  const transfers = useMemo(() => minimizeTransfers(bal), [bal]);
  const byId = (id: string) => members.find((m) => m.id === id);
  const myShare = meId ? expenses.reduce((s, e) => s + (e.expense_shares.find((x) => x.member_id === meId)?.amount_cents ?? 0), 0) : 0;

  const remove = async (e: ExpenseFull) => {
    if (!confirm(`Excluir o gasto "${e.description}"?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return setError(error.message);
    await logActivity(`excluiu o gasto ${e.description}`);
    reload();
  };

  const logActivity = async (action: string) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from("activity_log").insert({ trip_id: trip.id, user_id: data.user.id, action });
  };

  const markPaid = async (t: Transfer) => {
    const { error } = await supabase.from("settlements").insert({ trip_id: trip.id, from_member: t.from, to_member: t.to, amount_cents: t.cents, method: "pix", paid_at: new Date().toISOString() });
    if (error) return setError(error.message);
    await logActivity(`marcou acerto de ${fmtBRL(t.cents)} como pago`);
    setPix(null);
    reload();
  };

  const undoSettlement = async (s: SettlementRow) => {
    if (!confirm("Desfazer este acerto?")) return;
    await supabase.from("settlements").delete().eq("id", s.id);
    reload();
  };

  const budget = trip.budget_cents ?? 0;
  const pct = budget ? Math.min(100, Math.round((total / budget) * 100)) : 0;

  return (
    <div className="space-y-5">
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Realizado" value={fmtBRL(total)} hint={`${expenses.length} lançamento(s)`} />
        <Stat label="Orçamento previsto" value={budget ? fmtBRL(budget) : "—"} hint={budget ? `${pct}% usado` : "defina nas configurações"} />
        <Stat label="Por pessoa" value={fmtBRL(members.length ? Math.round(total / members.length) : 0)} hint={`${members.length} viajante(s)`} />
        <Stat label="Sua parte" value={fmtBRL(myShare)} hint={meId && bal.get(meId) ? (bal.get(meId)! > 0 ? `a receber ${fmtBRL(bal.get(meId))}` : `a pagar ${fmtBRL(-bal.get(meId)!)}`) : "tudo certo"} />
      </div>

      {budget > 0 && (
        <div className="card p-4">
          <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">Previsto x realizado</span><span className="mono">{fmtBRL(total)} / {fmtBRL(budget)}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ice" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={clsx("h-full rounded-full", total > budget ? "bg-danger" : "bg-blue")} style={{ width: `${pct}%` }} />
          </div>
          {total > budget && <p className="mt-2 text-xs text-danger">Os gastos passaram do orçamento em {fmtBRL(total - budget)}.</p>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Lançamentos</h2>
            {canWrite && <button className="btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}><Plus size={14} /> Novo gasto</button>}
          </div>
          {!canWrite && <Notice tone="blue">Visualizadores acompanham os gastos, mas não lançam.</Notice>}
          {showForm && canWrite && (
            <ExpenseForm trip={trip} members={members} meId={meId} onCancel={() => setShowForm(false)} onSaved={async (desc) => { setShowForm(false); await logActivity(`lançou o gasto ${desc}`); reload(); }} />
          )}
          {expenses.length === 0 ? (
            <EmptyState title="Nenhum gasto ainda" text="Lance o primeiro gasto e o Pino calcula quem deve a quem, já em real." />
          ) : (
            <ul className="card divide-y divide-line">
              {expenses.map((e) => {
                const payers = e.expense_payers.map((p) => memberName(byId(p.member_id))).join(", ");
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.color ?? "#8A92A6" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.description}</div>
                      <div className="text-xs text-gray">{catLabel(e.category)} · {e.spent_on.split("-").reverse().join("/")} · pago por {payers || "—"} · dividido entre {e.expense_shares.length}</div>
                    </div>
                    <div className="text-right">
                      <div className="mono font-semibold">{fmtBRL(e.amount_brl_cents)}</div>
                      {e.currency !== "BRL" && <div className="mono text-[11px] text-gray">{fmtMoney(e.amount_cents, e.currency)} · {Number(e.fx_rate).toFixed(4)}</div>}
                    </div>
                    {canWrite && <button className="btn-ghost btn-sm w-9 px-0" onClick={() => remove(e)} aria-label={`Excluir ${e.description}`}><Trash2 size={15} /></button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><Users size={16} /> Quem deve a quem</h2>
            {transfers.length === 0 ? (
              <p className="text-sm text-gray">Tudo acertado por aqui.</p>
            ) : (
              <ul className="space-y-2">
                {transfers.map((t, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Avatar name={memberName(byId(t.from))} size={24} />
                      <span className="truncate font-semibold">{memberName(byId(t.from))}</span>
                      <ArrowRight size={14} className="shrink-0 text-gray" />
                      <Avatar name={memberName(byId(t.to))} size={24} />
                      <span className="truncate font-semibold">{memberName(byId(t.to))}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="mono text-lg font-semibold">{fmtBRL(t.cents)}</span>
                      <button className="btn-primary btn-sm" onClick={() => setPix(t)}><QrCode size={14} /> Cobrar via Pix</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-gray">O Pino calcula o menor número de transferências para zerar as contas.</p>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><Wallet size={16} /> Por categoria</h2>
            {byCategory.length === 0 ? <p className="text-sm text-gray">Sem gastos lançados.</p> : (
              <ul className="space-y-2">
                {byCategory.map((c) => (
                  <li key={c.id}>
                    <div className="flex justify-between text-sm"><span>{c.label}</span><span className="mono">{fmtBRL(c.cents)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-ice"><div className="h-full rounded-full" style={{ width: `${Math.round((c.cents / total) * 100)}%`, background: c.color }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <h2 className="mb-2 font-bold">Saldos</h2>
            <ul className="space-y-1.5 text-sm">
              {members.map((m) => {
                const v = bal.get(m.id) ?? 0;
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate"><Avatar name={memberName(m)} url={m.profiles?.avatar_url} size={22} /> {memberName(m)}</span>
                    <span className={clsx("mono", v > 0 ? "text-ok" : v < 0 ? "text-danger" : "text-gray")}>{v > 0 ? "+" : ""}{fmtBRL(v)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {paid.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-2 font-bold">Acertos pagos</h2>
              <ul className="space-y-1.5 text-sm">
                {paid.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{memberName(byId(s.from_member))} → {memberName(byId(s.to_member))}</span>
                    <span className="flex items-center gap-1"><span className="mono">{fmtBRL(s.amount_cents)}</span><Pill tone="ok">pago</Pill>
                      {canWrite && <button className="text-xs text-gray underline" onClick={() => undoSettlement(s)}>desfazer</button>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {pix && <PixSettleModal transfer={pix} from={byId(pix.from)} to={byId(pix.to)} tripTitle={trip.title} onClose={() => setPix(null)} onPaid={() => markPaid(pix)} expenses={expenses} />}
    </div>
  );
}

type SplitMode = "igual" | "cotas" | "valor" | "alguns";

function ExpenseForm({ trip, members, meId, onCancel, onSaved }: { trip: Trip; members: Member[]; meId: string | null; onCancel: () => void; onSaved: (desc: string) => void }) {
  const supabase = supabaseBrowser();
  const today = new Date().toISOString().slice(0, 10);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(trip.currency && trip.currency !== "BRL" ? trip.currency : "BRL");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("alimentacao");
  const [multiPayer, setMultiPayer] = useState(false);
  const [payer, setPayer] = useState(meId ?? members[0]?.id ?? "");
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<SplitMode>("igual");
  const [included, setIncluded] = useState<Record<string, boolean>>(Object.fromEntries(members.map((m) => [m.id, true])));
  const [weights, setWeights] = useState<Record<string, string>>(Object.fromEntries(members.map((m) => [m.id, "1"])));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalCents = parseMoneyToCents(amount) ?? 0;

  /** Converte uma lista de valores na moeda original para centavos em real, fechando a soma no total em real (sobra para o pagador). */
  const toBrlShares = (shares: Share[], totalBrl: number, rate: number, payerId: string): Share[] => {
    const out = shares.map((s) => ({ memberId: s.memberId, cents: Math.round(s.cents * rate) }));
    const diff = totalBrl - out.reduce((a, b) => a + b.cents, 0);
    if (out.length) (out.find((s) => s.memberId === payerId) ?? out[0]).cents += diff;
    return out;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!description.trim()) return setErr("Descreva o gasto.");
    if (totalCents <= 0) return setErr("Informe um valor maior que zero.");

    // Quem pagou (na moeda original)
    let payers: Share[];
    if (multiPayer) {
      payers = members.map((m) => ({ memberId: m.id, cents: parseMoneyToCents(payerAmounts[m.id] || "") ?? 0 })).filter((p) => p.cents > 0);
      const sum = payers.reduce((a, b) => a + b.cents, 0);
      if (sum !== totalCents) return setErr(`A soma de quem pagou (${fmtMoney(sum, currency)}) precisa ser igual ao total (${fmtMoney(totalCents, currency)}).`);
    } else {
      if (!payer) return setErr("Escolha quem pagou.");
      payers = [{ memberId: payer, cents: totalCents }];
    }
    const mainPayer = [...payers].sort((a, b) => b.cents - a.cents)[0].memberId;

    // Divisão (na moeda original)
    let shares: Share[] = [];
    if (mode === "igual") shares = splitEqual(totalCents, members.map((m) => m.id), mainPayer);
    if (mode === "alguns") {
      const ids = members.filter((m) => included[m.id]).map((m) => m.id);
      if (!ids.length) return setErr("Escolha pelo menos uma pessoa para dividir.");
      shares = splitEqual(totalCents, ids, mainPayer);
    }
    if (mode === "cotas") {
      const w = members.map((m) => ({ memberId: m.id, weight: Math.max(0, Number(weights[m.id]?.replace(",", ".") || 0)) })).filter((x) => x.weight > 0);
      if (!w.length) return setErr("Defina pelo menos uma cota.");
      shares = splitByWeights(totalCents, w, mainPayer);
    }
    if (mode === "valor") {
      shares = members.map((m) => ({ memberId: m.id, cents: parseMoneyToCents(values[m.id] || "") ?? 0 })).filter((s) => s.cents > 0);
      const sum = shares.reduce((a, b) => a + b.cents, 0);
      if (sum !== totalCents) return setErr(`A soma das partes (${fmtMoney(sum, currency)}) precisa ser igual ao total (${fmtMoney(totalCents, currency)}). Faltam ${fmtMoney(totalCents - sum, currency)}.`);
    }

    setBusy(true);
    try {
      // Cotação congelada na data do gasto (RN-04)
      let rate = 1;
      if (currency !== "BRL") {
        const r = await fetch(`/api/trips/${trip.id}/fx?currency=${currency}&date=${date}`);
        const j = await r.json();
        if (!r.ok || !j.rate) throw new Error("Não foi possível obter a cotação agora. Tente de novo em instantes.");
        rate = Number(j.rate);
      }
      const totalBrl = Math.round(totalCents * rate);
      const payersBrl = toBrlShares(payers, totalBrl, rate, mainPayer);
      const sharesBrl = toBrlShares(shares, totalBrl, rate, mainPayer);
      const { data: u } = await supabase.auth.getUser();
      const { data: exp, error } = await supabase.from("expenses").insert({
        trip_id: trip.id, description: description.trim(), category, amount_cents: totalCents, currency, fx_rate: rate,
        amount_brl_cents: totalBrl, spent_on: date, split_mode: mode, created_by: u.user?.id,
      }).select("id").single();
      if (error) throw error;
      const [p, s] = await Promise.all([
        supabase.from("expense_payers").insert(payersBrl.map((x) => ({ expense_id: exp.id, member_id: x.memberId, amount_cents: x.cents }))),
        supabase.from("expense_shares").insert(sharesBrl.filter((x) => x.cents > 0).map((x) => ({ expense_id: exp.id, member_id: x.memberId, amount_cents: x.cents }))),
      ]);
      if (p.error || s.error) {
        await supabase.from("expenses").delete().eq("id", exp.id);
        throw p.error || s.error;
      }
      onSaved(description.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar o gasto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="card space-y-4 p-4" aria-label="Novo gasto">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Descrição</span>
          <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Jantar na Tasca do Chico" required /></label>
        <label><span className="label">Valor</span>
          <div className="mt-1 flex gap-2">
            <select className="input w-24" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Moeda">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </div>
          {currency !== "BRL" && <span className="mt-1 block text-[11px] text-gray">A cotação para real fica congelada na data do gasto.</span>}
        </label>
        <label><span className="label">Data</span><input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="label">Categoria</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => (
              <button type="button" key={c.id} onClick={() => setCategory(c.id)} className={clsx("chip min-h-9", category === c.id && "border-blue bg-blue-50 text-blue")} aria-pressed={category === c.id}>{c.label}</button>
            ))}
          </div>
        </label>
      </div>

      <fieldset>
        <legend className="label mb-1">Quem pagou</legend>
        <div className="mb-2 flex gap-1.5">
          <button type="button" className={clsx("chip min-h-9", !multiPayer && "border-blue bg-blue-50 text-blue")} onClick={() => setMultiPayer(false)}>Uma pessoa</button>
          <button type="button" className={clsx("chip min-h-9", multiPayer && "border-blue bg-blue-50 text-blue")} onClick={() => setMultiPayer(true)}>Várias pessoas</button>
        </div>
        {!multiPayer ? (
          <select className="input" value={payer} onChange={(e) => setPayer(e.target.value)} aria-label="Quem pagou">
            {members.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
          </select>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm"><span className="w-28 truncate">{memberName(m)}</span>
                <input className="input mono" inputMode="decimal" placeholder="0,00" value={payerAmounts[m.id] ?? ""} onChange={(e) => setPayerAmounts({ ...payerAmounts, [m.id]: e.target.value })} /></label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="label mb-1">Como dividir</legend>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {([["igual", "Igual entre todos"], ["alguns", "Só alguns"], ["cotas", "Por cotas"], ["valor", "Por valor"]] as [SplitMode, string][]).map(([k, l]) => (
            <button type="button" key={k} className={clsx("chip min-h-9", mode === k && "border-blue bg-blue-50 text-blue")} onClick={() => setMode(k)} aria-pressed={mode === k}>{l}</button>
          ))}
        </div>
        {mode === "igual" && <p className="text-xs text-gray">{members.length} pessoa(s) · {fmtMoney(Math.floor(totalCents / Math.max(1, members.length)), currency)} cada. A sobra de centavos fica com quem pagou.</p>}
        {mode === "alguns" && (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.id} className="chip min-h-9 cursor-pointer"><input type="checkbox" checked={!!included[m.id]} onChange={(e) => setIncluded({ ...included, [m.id]: e.target.checked })} /> {memberName(m)}</label>
            ))}
          </div>
        )}
        {mode === "cotas" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm"><span className="w-28 truncate">{memberName(m)}</span>
                <input className="input mono w-20" inputMode="decimal" value={weights[m.id] ?? ""} onChange={(e) => setWeights({ ...weights, [m.id]: e.target.value })} aria-label={`Cotas de ${memberName(m)}`} /> cota(s)</label>
            ))}
          </div>
        )}
        {mode === "valor" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm"><span className="w-28 truncate">{memberName(m)}</span>
                <input className="input mono" inputMode="decimal" placeholder="0,00" value={values[m.id] ?? ""} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} /></label>
            ))}
          </div>
        )}
      </fieldset>

      {err && <Notice tone="danger">{err}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar gasto"}</button>
      </div>
    </form>
  );
}
