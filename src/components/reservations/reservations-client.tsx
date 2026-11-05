"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Copy, Upload, FileText, PenLine, Trash2, Check, Loader2, Mail, Anchor,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Reservation } from "@/lib/types";
import { EmptyState, Notice, PageTitle, Pill } from "@/components/ui";
import { fmtMoney, parseMoneyToCents, splitEqual, toBrlCents } from "@/lib/domain/settle";
import { RES_KINDS, fmtLocal, toInput, toDb } from "./format";

type Draft = {
  kind: string;
  title: string;
  code: string;
  provider: string;
  start_at: string;
  end_at: string;
  location: string;
  value: string;
  currency: string;
  free_cancel_until: string;
  segments: { origin: string; destination: string; departs_at: string | null; arrives_at: string | null; number: string | null }[];
  source: "manual" | "texto" | "upload";
};

const emptyDraft = (currency: string): Draft => ({ kind: "voo", title: "", code: "", provider: "", start_at: "", end_at: "", location: "", value: "", currency, free_cancel_until: "", segments: [], source: "manual" });

type Props = {
  tripId: string;
  inbox: string;
  reservations: Reservation[];
  days: { id: string; date: string | null; position: number }[];
  members: { id: string; user_id: string | null }[];
  myMemberId: string | null;
  canEdit: boolean;
  canSeeExpenses: boolean;
  linkedExpenses: { id: string; reservation_id: string }[];
  tripCurrency: string;
  tripStart: string | null;
  tripEnd: string | null;
};

export function ReservationsClient(p: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "texto" | "upload" | "manual">("none");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => {
    const g = new Map<string, Reservation[]>();
    for (const r of p.reservations) g.set(r.kind, [...(g.get(r.kind) ?? []), r]);
    return RES_KINDS.filter((k) => g.has(k.id)).map((k) => ({ kind: k, items: g.get(k.id)! }));
  }, [p.reservations]);

  const copyInbox = async () => {
    await navigator.clipboard.writeText(p.inbox);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <PageTitle eyebrow="M07 · Reservas e caixa de entrada" title="Reservas" actions={p.canEdit ? (
        <>
          <button className="btn-secondary btn-sm" onClick={() => { setMode("texto"); setDraft(null); }}><FileText size={14} /> Colar texto</button>
          <button className="btn-secondary btn-sm" onClick={() => { setMode("upload"); setDraft(null); }}><Upload size={14} /> PDF ou print</button>
          <button className="btn-primary btn-sm" onClick={() => { setMode("manual"); setDraft(emptyDraft(p.tripCurrency)); }}><PenLine size={14} /> Adicionar</button>
        </>
      ) : undefined} />

      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <Mail className="text-blue" size={20} />
        <div className="min-w-0 flex-1">
          <div className="label">E-mail da viagem</div>
          <div className="mono truncate text-sm font-semibold">{p.inbox}</div>
          <p className="text-xs text-gray">A caixa de entrada por e-mail entra numa próxima etapa. Por enquanto, cole o texto da confirmação ou envie o PDF/print.</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={copyInbox}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}</button>
      </div>

      {p.canEdit && mode !== "none" && !draft && (
        <ImportPanel tripId={p.tripId} mode={mode} onCancel={() => setMode("none")} onParsed={(d) => setDraft(d)} currency={p.tripCurrency} />
      )}

      {draft && (
        <ReviewForm
          {...p}
          draft={draft}
          onChange={setDraft}
          onCancel={() => { setDraft(null); setMode("none"); }}
          onSaved={() => { setDraft(null); setMode("none"); router.refresh(); }}
        />
      )}

      {grouped.length === 0 ? (
        <EmptyState title="Nenhuma reserva ainda" text="Cole a confirmação do voo, do hotel ou do ingresso. O Pino lê, você confere e a reserva vira horário fixo no roteiro e gasto dividido." mood="oi" />
      ) : (
        <div className="space-y-5">
          {grouped.map(({ kind, items }) => (
            <section key={kind.id}>
              <h2 className="label mb-2 flex items-center gap-1.5"><kind.icon size={14} /> {kind.label} · {items.length}</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((r) => <ReservationCard key={r.id} r={r} {...p} onChanged={() => router.refresh()} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ReservationCard({ r, canEdit, tripStart, tripEnd, linkedExpenses, onChanged }: { r: Reservation; onChanged: () => void } & Props) {
  const Icon = RES_KINDS.find((k) => k.id === r.kind)?.icon ?? Package;
  const [busy, setBusy] = useState(false);
  const start = r.start_at?.slice(0, 10);
  const outside = start && tripStart && tripEnd && (start < tripStart || start > tripEnd);
  const cancelSoon = r.free_cancel_until && new Date(r.free_cancel_until).getTime() - Date.now() < 7 * 86400000 && new Date(r.free_cancel_until).getTime() > Date.now();
  const expense = linkedExpenses.find((e) => e.reservation_id === r.id);

  const remove = async () => {
    if (!confirm(`Excluir a reserva "${r.title}"?`)) return;
    const sb = supabaseBrowser();
    setBusy(true);
    // RN-06: pergunta se o gasto vinculado também deve ser excluído
    if (expense && confirm("Esta reserva tem um gasto vinculado. Excluir o gasto também?")) {
      await sb.from("expenses").delete().eq("id", expense.id);
    }
    if (r.item_id && confirm("Remover também o horário fixo desta reserva do roteiro?")) {
      await sb.from("itinerary_items").delete().eq("id", r.item_id);
    }
    const { error } = await sb.from("reservations").delete().eq("id", r.id);
    setBusy(false);
    if (error) alert("Não foi possível excluir: " + error.message);
    else onChanged();
  };

  return (
    <li className="card flex gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue"><Icon size={18} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-bold">{r.title}</h3>
          {r.item_id && <Pill tone="blue"><Anchor size={10} /> no roteiro</Pill>}
          {r.source !== "manual" && <Pill tone="teal">lida pelo Pino</Pill>}
        </div>
        <div className="mono mt-0.5 text-xs text-gray">
          {r.start_at ? fmtLocal(r.start_at) : "sem data"}{r.end_at ? ` → ${fmtLocal(r.end_at)}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray">
          {r.code && <span>Código <b className="mono text-navy">{r.code}</b></span>}
          {r.provider && <span>{r.provider}</span>}
          {r.location && <span>{r.location}</span>}
          {r.value_cents != null && <span className="mono font-semibold text-navy">{fmtMoney(r.value_cents, r.currency || "BRL")}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.free_cancel_until && <Pill tone={cancelSoon ? "warn" : "ok"}>Cancelamento grátis até {fmtLocal(r.free_cancel_until)}</Pill>}
          {outside && <Pill tone="danger">Fora do período da viagem</Pill>}
          {expense && <Pill>gasto lançado</Pill>}
        </div>
      </div>
      {canEdit && (
        <button className="btn-ghost w-11 self-start px-0 text-gray hover:text-danger" onClick={remove} disabled={busy} aria-label={`Excluir ${r.title}`}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
        </button>
      )}
    </li>
  );
}

function ImportPanel({ tripId, mode, onCancel, onParsed, currency }: { tripId: string; mode: string; onCancel: () => void; onParsed: (d: Draft) => void; currency: string }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      if (text) fd.set("text", text);
      if (file) fd.set("file", file);
      const res = await fetch(`/api/trips/${tripId}/reservations/parse`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na leitura");
      const r = json.reservation;
      onParsed({
        kind: r.kind, title: r.title ?? "", code: r.code ?? "", provider: r.provider ?? "",
        start_at: r.start_at?.slice(0, 16) ?? "", end_at: r.end_at?.slice(0, 16) ?? "", location: r.location ?? "",
        value: r.value != null ? String(r.value).replace(".", ",") : "", currency: r.currency || currency,
        free_cancel_until: r.free_cancel_until?.slice(0, 16) ?? "", segments: r.segments ?? [], source: file ? "upload" : "texto",
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mb-5 p-4">
      <h2 className="mb-1 font-bold">{mode === "upload" ? "Enviar PDF ou print da confirmação" : "Colar texto da confirmação"}</h2>
      <p className="mb-3 text-sm text-gray">O Pino lê e mostra os campos para você conferir. Nada é salvo sem sua confirmação. Nomes, documentos e dados de pagamento são ignorados.</p>
      {mode === "upload" ? (
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-ice p-4 text-center text-sm text-gray hover:border-blue/40">
          <Upload size={20} className="text-blue" />
          {file ? <span className="font-semibold text-navy">{file.name}</span> : <span>Toque para escolher um PDF ou imagem (até 8 MB)</span>}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,.eml" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      ) : (
        <textarea className="input min-h-40 py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui o e-mail de confirmação (voo, hotel, ingresso…)" aria-label="Texto da confirmação" />
      )}
      {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={run} disabled={busy || (!text.trim() && !file)}>
          {busy ? <><Loader2 className="animate-spin" size={16} /> Lendo…</> : "Ler com o Pino"}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function itemKindFor(kind: string) {
  if (["voo", "trem", "onibus", "barco", "carro"].includes(kind)) return "trajeto";
  if (["hotel", "aluguel"].includes(kind)) return "hospedagem";
  if (kind === "restaurante") return "refeicao";
  return "atividade";
}

function ReviewForm(p: Props & { draft: Draft; onChange: (d: Draft) => void; onCancel: () => void; onSaved: () => void }) {
  const d = p.draft;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => p.onChange({ ...d, [k]: v });
  const startDate = d.start_at.slice(0, 10);
  const day = p.days.find((x) => x.date === startDate);
  const [anchor, setAnchor] = useState(true);
  const [expense, setExpense] = useState(true);
  const [fx, setFx] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valueCents = parseMoneyToCents(d.value);
  const foreign = d.currency.toUpperCase() !== "BRL";
  const canAnchor = !!day && d.start_at.length >= 16;
  const canExpense = p.canSeeExpenses && valueCents != null && valueCents > 0 && !!p.myMemberId;

  const save = async () => {
    if (!d.title.trim()) { setErr("Dê um título à reserva."); return; }
    const fxRate = foreign ? Number(fx.replace(",", ".")) : 1;
    if (canExpense && expense && foreign && !(fxRate > 0)) { setErr("Informe a cotação para converter o gasto em reais."); return; }
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    try {
      const { data: res, error } = await sb.from("reservations").insert({
        trip_id: p.tripId, kind: d.kind, title: d.title.trim(), code: d.code || null, provider: d.provider || null,
        start_at: toDb(d.start_at), end_at: toDb(d.end_at), location: d.location || null, value_cents: valueCents,
        currency: d.currency.toUpperCase() || "BRL", free_cancel_until: toDb(d.free_cancel_until), source: d.source,
        extracted: d.source === "manual" ? null : { segments: d.segments }, created_by: auth.user?.id,
      }).select("id").single();
      if (error) throw error;

      if (d.segments.length) {
        await sb.from("reservation_segments").insert(d.segments.map((s, i) => ({
          reservation_id: res.id, origin: s.origin, destination: s.destination,
          departs_at: s.departs_at ? toDb(s.departs_at.slice(0, 16)) : null, arrives_at: s.arrives_at ? toDb(s.arrives_at.slice(0, 16)) : null, number: s.number, position: i,
        })));
      }

      // RF-063: reserva vira âncora no roteiro
      if (canAnchor && anchor && day) {
        const time = d.start_at.slice(11, 16);
        const { data: dayItems } = await sb.from("itinerary_items").select("id, start_time, position").eq("day_id", day.id).order("position");
        const list = (dayItems ?? []) as { id: string; start_time: string | null; position: number }[];
        const idx = list.filter((it) => (it.start_time ?? "00:00") <= time).length;
        for (const it of list.slice(idx).reverse()) await sb.from("itinerary_items").update({ position: it.position + 1 }).eq("id", it.id);
        let duration = 60;
        if (d.end_at.length >= 16 && d.end_at.slice(0, 10) === startDate) {
          const mins = (new Date(toDb(d.end_at)!).getTime() - new Date(toDb(d.start_at)!).getTime()) / 60000;
          if (mins > 0) duration = Math.min(600, Math.round(mins));
        }
        if (["hotel", "aluguel"].includes(d.kind)) duration = 30;
        const { data: item, error: iErr } = await sb.from("itinerary_items").insert({
          trip_id: p.tripId, day_id: day.id, kind: itemKindFor(d.kind), title: d.title.trim(), anchor: true, anchor_time: time, start_time: time,
          duration_min: duration, transport_mode: d.kind === "voo" ? "aviao" : d.kind === "trem" ? "trem" : "a_pe", verified: true,
          position: idx, notes: d.code ? `Código ${d.code}` : null, created_by: auth.user?.id,
        }).select("id").single();
        if (iErr) throw iErr;
        await sb.from("reservations").update({ item_id: item.id }).eq("id", res.id);
      }

      // RF-063: gasto dividido igualmente entre quem tem conta na viagem
      if (canExpense && expense && valueCents && p.myMemberId) {
        const brl = toBrlCents(valueCents, fxRate);
        const ids = p.members.filter((m) => m.user_id).map((m) => m.id);
        const { data: exp, error: eErr } = await sb.from("expenses").insert({
          trip_id: p.tripId, description: d.title.trim(), category: ["hotel", "aluguel"].includes(d.kind) ? "hospedagem" : ["voo", "trem", "onibus", "carro", "barco"].includes(d.kind) ? "transporte" : d.kind === "restaurante" ? "alimentacao" : "passeios",
          amount_cents: valueCents, currency: d.currency.toUpperCase(), fx_rate: fxRate, amount_brl_cents: brl,
          spent_on: startDate || new Date().toISOString().slice(0, 10), reservation_id: res.id, split_mode: "igual", created_by: auth.user?.id,
        }).select("id").single();
        if (eErr) throw eErr;
        await sb.from("expense_payers").insert({ expense_id: exp.id, member_id: p.myMemberId, amount_cents: brl });
        await sb.from("expense_shares").insert(splitEqual(brl, ids.length ? ids : [p.myMemberId], p.myMemberId).map((s) => ({ expense_id: exp.id, member_id: s.memberId, amount_cents: s.cents })));
      }
      p.onSaved();
    } catch (e) {
      setErr((e as Error).message || "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const field = "flex flex-col gap-1 text-sm font-medium";
  return (
    <div className="card pino-border mb-5 p-4">
      <h2 className="mb-1 font-bold">{d.source === "manual" ? "Nova reserva" : "Confira o que o Pino leu"}</h2>
      {d.source !== "manual" && <p className="mb-3 text-sm text-gray">Revise cada campo antes de salvar. Se algo estiver errado, corrija aqui.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>Tipo
          <select className="input" value={d.kind} onChange={(e) => set("kind", e.target.value)}>
            {RES_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className={field}>Título<input className="input" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Voo GRU → LIS" /></label>
        <label className={field}>Código / localizador<input className="input mono" value={d.code} onChange={(e) => set("code", e.target.value)} /></label>
        <label className={field}>Fornecedor<input className="input" value={d.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Companhia, hotel…" /></label>
        <label className={field}>Início (hora local)<input type="datetime-local" className="input" value={toInput(d.start_at)} onChange={(e) => set("start_at", e.target.value)} /></label>
        <label className={field}>Fim (hora local)<input type="datetime-local" className="input" value={toInput(d.end_at)} onChange={(e) => set("end_at", e.target.value)} /></label>
        <label className={clsx(field, "sm:col-span-2")}>Local<input className="input" value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="Endereço, aeroporto ou estação" /></label>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <label className={field}>Valor total<input className="input mono" inputMode="decimal" value={d.value} onChange={(e) => set("value", e.target.value)} placeholder="0,00" /></label>
          <label className={field}>Moeda<input className="input mono uppercase" maxLength={3} value={d.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></label>
        </div>
        <label className={field}>Cancelamento grátis até<input type="datetime-local" className="input" value={toInput(d.free_cancel_until)} onChange={(e) => set("free_cancel_until", e.target.value)} /></label>
      </div>

      {d.segments.length > 0 && (
        <div className="mt-3 rounded-xl bg-ice p-3 text-sm">
          <div className="label mb-1">Trechos</div>
          {d.segments.map((s, i) => <div key={i} className="mono text-xs">{s.number ?? ""} {s.origin} → {s.destination} {s.departs_at ? `· ${s.departs_at.replace("T", " ")}` : ""}</div>)}
        </div>
      )}

      <div className="mt-4 space-y-2 text-sm">
        <label className={clsx("flex items-start gap-2", !canAnchor && "opacity-50")}>
          <input type="checkbox" className="mt-1 h-4 w-4" checked={canAnchor && anchor} disabled={!canAnchor} onChange={(e) => setAnchor(e.target.checked)} />
          <span><b>Travar no roteiro</b> como horário fixo no dia {startDate || "—"}{!canAnchor && " (informe início com hora dentro das datas da viagem)"}.</span>
        </label>
        {p.canSeeExpenses && (
          <label className={clsx("flex items-start gap-2", !canExpense && "opacity-50")}>
            <input type="checkbox" className="mt-1 h-4 w-4" checked={canExpense && expense} disabled={!canExpense} onChange={(e) => setExpense(e.target.checked)} />
            <span><b>Lançar gasto</b> pago por você e dividido igualmente entre o grupo.</span>
          </label>
        )}
        {canExpense && expense && foreign && (
          <label className="flex flex-wrap items-center gap-2 pl-6">Cotação {d.currency} → BRL (fica congelada)
            <input className="input mono w-28" inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="5,92" />
          </label>
        )}
        {d.free_cancel_until && <p className="pl-6 text-xs text-gray">O prazo de cancelamento grátis fica destacado na lista quando faltar menos de 7 dias.</p>}
      </div>

      {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Salvar reserva</button>
        <button className="btn-ghost" onClick={p.onCancel}>Descartar</button>
      </div>
    </div>
  );
}
