"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ExternalLink, Globe, Loader2, Trash2, Copy } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Day, Trip } from "@/lib/types";
import { Notice, PageTitle } from "@/components/ui";
import { addDays, daysBetween } from "@/lib/domain/time";
import { fmtBRL, parseMoneyToCents } from "@/lib/domain/settle";

const CURRENCIES = ["BRL", "EUR", "USD", "GBP", "CHF", "ARS", "CLP", "UYU", "MXN", "JPY"];

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "roteiro";
}

export function TripSettings({ trip, isOwner, days, reservations, anchors }: {
  trip: Trip; isOwner: boolean; days: Day[]; reservations: { id: string; title: string; start_at: string | null }[]; anchors: { id: string; title: string; day_id: string | null }[];
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [f, setF] = useState({
    title: trip.title,
    start: trip.start_date ?? "",
    end: trip.end_date ?? "",
    currency: trip.currency,
    budget: trip.budget_cents != null ? (trip.budget_cents / 100).toFixed(2).replace(".", ",") : "",
    pace: trip.pace,
    adults: trip.travelers_adults,
    children: trip.travelers_children,
    ages: (trip.children_ages ?? []).join(", "),
    origin: trip.origin_city ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: React.ReactNode } | null>(null);
  const [pub, setPub] = useState({ is_public: trip.is_public, hide: trip.public_hide_costs, slug: trip.slug });
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const update: Record<string, unknown> = {
        title: f.title.trim(), currency: f.currency, budget_cents: f.budget ? parseMoneyToCents(f.budget) : null, pace: f.pace,
        travelers_adults: Math.max(1, Number(f.adults) || 1), travelers_children: Math.max(0, Number(f.children) || 0),
        children_ages: f.ages.split(/[,; ]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 18), origin_city: f.origin || null,
      };
      const warnings: string[] = [];
      let newEnd = f.end || null;
      // RN-11: mudou a data de início → desloca os dias mantendo a ordem
      if (f.start && trip.start_date && f.start !== trip.start_date) {
        const delta = daysBetween(trip.start_date, f.start);
        for (const d of days) if (d.date) await sb.from("days").update({ date: addDays(d.date, delta) }).eq("id", d.id);
        if (trip.end_date && (!f.end || f.end === trip.end_date)) newEnd = addDays(trip.end_date, delta);
        warnings.push(`Os ${days.length} dias do roteiro foram deslocados em ${delta > 0 ? "+" : ""}${delta} dia(s).`);
      }
      update.start_date = f.start || null;
      update.end_date = newEnd;
      // dias além da nova data final
      if (newEnd && f.start) {
        const shiftedDays = days.map((d) => ({ ...d, date: d.date && trip.start_date && f.start !== trip.start_date ? addDays(d.date, daysBetween(trip.start_date, f.start)) : d.date }));
        const beyond = shiftedDays.filter((d) => d.date && (d.date > newEnd! || d.date < f.start));
        if (beyond.length) warnings.push(`${beyond.length} dia(s) do roteiro ficaram fora do novo período.`);
        const outAnchors = anchors.filter((a) => beyond.some((d) => d.id === a.day_id));
        if (outAnchors.length) warnings.push(`Horários fixos fora do período: ${outAnchors.map((a) => a.title).join(", ")}.`);
      }
      const outRes = reservations.filter((r) => r.start_at && newEnd && f.start && (r.start_at.slice(0, 10) < f.start || r.start_at.slice(0, 10) > newEnd));
      if (outRes.length) warnings.push(`Reservas que continuam nas datas antigas: ${outRes.map((r) => r.title).join(", ")}. Confira com o fornecedor.`);
      const { error } = await sb.from("trips").update(update).eq("id", trip.id);
      if (error) throw error;
      setMsg(warnings.length ? { tone: "warn", text: <><b>Salvo.</b> {warnings.join(" ")}</> } : { tone: "ok", text: "Alterações salvas." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const savePublic = async (is_public: boolean, hide: boolean) => {
    const slug = pub.slug || `${slugify(f.title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await sb.from("trips").update({ is_public, public_hide_costs: hide, slug }).eq("id", trip.id);
    if (error) { setMsg({ tone: "danger", text: error.message }); return; }
    setPub({ is_public, hide, slug });
  };

  const publicUrl = pub.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/v/${pub.slug}` : "";

  const remove = async () => {
    const typed = prompt(`Para excluir de vez, digite o nome da viagem: ${trip.title}`);
    if (typed !== trip.title) return;
    const { error } = await sb.from("trips").delete().eq("id", trip.id);
    if (error) { setMsg({ tone: "danger", text: error.message }); return; }
    router.push("/app");
    router.refresh();
  };

  const field = "flex flex-col gap-1 text-sm font-medium";
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Configurações" title="Dados da viagem" />
      <form onSubmit={save} className="card grid gap-3 p-4 sm:grid-cols-2">
        <label className={`${field} sm:col-span-2`}>Título<input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} required /></label>
        <label className={field}>Início<input type="date" className="input" value={f.start} onChange={(e) => set("start", e.target.value)} /></label>
        <label className={field}>Fim<input type="date" className="input" value={f.end} min={f.start || undefined} onChange={(e) => set("end", e.target.value)} /></label>
        <label className={field}>Moeda principal
          <select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className={field}>Orçamento total (R$)<input className="input mono" inputMode="decimal" value={f.budget} onChange={(e) => set("budget", e.target.value)} placeholder="Opcional" /></label>
        <label className={field}>Ritmo
          <select className="input" value={f.pace} onChange={(e) => set("pace", e.target.value)}>
            <option value="leve">Leve</option><option value="equilibrado">Equilibrado</option><option value="intenso">Intenso</option>
          </select>
        </label>
        <label className={field}>Cidade de origem<input className="input" value={f.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Ex.: São Paulo" /></label>
        <label className={field}>Adultos<input type="number" min={1} className="input" value={f.adults} onChange={(e) => set("adults", Number(e.target.value))} /></label>
        <label className={field}>Crianças<input type="number" min={0} className="input" value={f.children} onChange={(e) => set("children", Number(e.target.value))} /></label>
        {f.children > 0 && <label className={`${field} sm:col-span-2`}>Idades das crianças<input className="input" value={f.ages} onChange={(e) => set("ages", e.target.value)} placeholder="Ex.: 4, 7" /></label>}
        {f.start && trip.start_date && f.start !== trip.start_date && (
          <div className="sm:col-span-2"><Notice tone="blue">Ao salvar, os dias do roteiro andam junto ({daysBetween(trip.start_date, f.start) > 0 ? "+" : ""}{daysBetween(trip.start_date, f.start)} dia(s)). Reservas ficam onde estão e serão sinalizadas.</Notice></div>
        )}
        {msg && <div className="sm:col-span-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Salvar</button></div>
        {trip.budget_cents != null && <p className="text-xs text-gray sm:col-span-2">Orçamento atual: {fmtBRL(trip.budget_cents)}</p>}
      </form>

      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Globe size={16} className="text-blue" /> Página pública</h2>
        <p className="mb-3 text-sm text-gray">Roteiro somente leitura, com botão “copiar este roteiro”. Reservas, documentos e nomes das pessoas nunca são publicados.</p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={pub.is_public} onChange={(e) => savePublic(e.target.checked, pub.hide)} /> Publicar roteiro
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={pub.hide} onChange={(e) => savePublic(pub.is_public, e.target.checked)} /> Ocultar custos estimados
        </label>
        {pub.is_public && pub.slug && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-ice p-2">
            <span className="mono min-w-0 flex-1 truncate text-xs">{publicUrl}</span>
            <button className="btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} /> : <Copy size={14} />} Copiar</button>
            <Link className="btn-secondary btn-sm" href={`/v/${pub.slug}`} target="_blank"><ExternalLink size={14} /> Abrir</Link>
          </div>
        )}
      </section>

      {isOwner && (
        <section className="card border-danger/30 p-4">
          <h2 className="mb-1 font-bold text-danger">Excluir viagem</h2>
          <p className="mb-3 text-sm text-gray">Apaga roteiro, reservas, gastos e mala de todos os participantes. Não dá para desfazer.</p>
          <button className="btn-danger" onClick={remove}><Trash2 size={16} /> Excluir viagem</button>
        </section>
      )}
    </div>
  );
}
