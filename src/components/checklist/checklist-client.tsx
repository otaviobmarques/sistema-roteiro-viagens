"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Loader2, Plus, Sparkles, Trash2, Users, ListChecks, Luggage } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState, Notice, PageTitle, PinoAvatar, Pill } from "@/components/ui";
import { fmtDateShort } from "@/lib/domain/time";

export type ChecklistItem = {
  id: string;
  trip_id: string;
  list: "mala" | "pre_viagem";
  category: string;
  label: string;
  assignee: string | null;
  shared: boolean;
  done: boolean;
  due_date: string | null;
  position: number;
};

type Suggestion = { list: "mala" | "pre_viagem"; category: string; label: string; shared: boolean; pick: boolean };

const DEFAULT_PRE_TRIP = [
  { category: "Documentos", label: "Conferir validade do passaporte (mínimo 6 meses)" },
  { category: "Documentos", label: "Verificar exigência de visto e vacinas" },
  { category: "Seguro", label: "Contratar seguro viagem" },
  { category: "Dinheiro", label: "Avisar o banco sobre a viagem" },
  { category: "Dinheiro", label: "Comprar câmbio ou cartão internacional" },
  { category: "Conectividade", label: "Comprar chip internacional ou eSIM" },
  { category: "Ingressos", label: "Comprar ingressos com horário que esgotam" },
  { category: "Casa", label: "Organizar casa, plantas e pets" },
];

export function ChecklistClient({ tripId, items: initial, members, canEdit, myMemberId }: {
  tripId: string; items: ChecklistItem[]; members: { id: string; name: string }[]; canEdit: boolean; myMemberId: string | null;
}) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<"mala" | "pre_viagem">("mala");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [shared, setShared] = useState(false);
  const [assignee, setAssignee] = useState<string>("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [intro, setIntro] = useState("");

  const reload = async () => {
    const { data } = await sb.from("checklist_items").select("*").eq("trip_id", tripId).order("position");
    if (data) setItems(data as ChecklistItem[]);
  };

  // tempo real: outras pessoas marcando itens
  useEffect(() => {
    const ch = sb.channel(`checklist:${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items", filter: `trip_id=eq.${tripId}` }, () => reload())
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const current = items.filter((i) => i.list === tab);
  const groups = useMemo(() => {
    const g = new Map<string, ChecklistItem[]>();
    for (const i of current) g.set(i.category, [...(g.get(i.category) ?? []), i]);
    return [...g.entries()];
  }, [current]);
  const doneCount = current.filter((i) => i.done).length;
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name;

  const toggle = async (it: ChecklistItem) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    const { error } = await sb.from("checklist_items").update({ done: !it.done }).eq("id", it.id);
    if (error) { setErr("Não foi possível marcar: " + error.message); reload(); }
  };

  const insertMany = async (rows: Omit<ChecklistItem, "id" | "trip_id" | "position" | "done">[]) => {
    const start = items.length;
    const { error } = await sb.from("checklist_items").insert(rows.map((r, i) => ({ ...r, trip_id: tripId, position: start + i })));
    if (error) throw error;
    await reload();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await insertMany([{ list: tab, category: category.trim() || (tab === "mala" ? "Geral" : "Tarefas"), label: label.trim(), shared, assignee: shared && assignee ? assignee : null, due_date: tab === "pre_viagem" && due ? due : null }]);
      setLabel("");
      setDue("");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (it: ChecklistItem) => {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    await sb.from("checklist_items").delete().eq("id", it.id);
  };

  const setAssigneeFor = async (it: ChecklistItem, value: string) => {
    const v = value || null;
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, assignee: v, shared: !!v || x.shared } : x)));
    await sb.from("checklist_items").update({ assignee: v, shared: !!v || it.shared }).eq("id", it.id);
  };

  const addDefaults = async () => {
    const existing = new Set(items.map((i) => i.label.toLowerCase()));
    const rows = DEFAULT_PRE_TRIP.filter((d) => !existing.has(d.label.toLowerCase())).map((d) => ({ list: "pre_viagem" as const, category: d.category, label: d.label, shared: false, assignee: null, due_date: null }));
    if (!rows.length) return;
    setBusy(true);
    try { await insertMany(rows); setTab("pre_viagem"); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const suggest = async () => {
    setSuggesting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/pack`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setIntro(json.intro);
      setSuggestions(json.items.map((s: Omit<Suggestion, "pick">) => ({ ...s, pick: true })));
    } catch (e) {
      setErr((e as Error).message || "Falha na sugestão");
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestions = async () => {
    if (!suggestions) return;
    const rows = suggestions.filter((s) => s.pick).map((s) => ({ list: s.list, category: s.category, label: s.label, shared: s.shared, assignee: null, due_date: null }));
    setBusy(true);
    try { await insertMany(rows); setSuggestions(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageTitle eyebrow="M10 · Preparação" title="Mala e checklist" actions={canEdit ? (
        <>
          <button className="btn-secondary btn-sm" onClick={addDefaults} disabled={busy}><ListChecks size={14} /> Checklist pré-viagem padrão</button>
          <button className="btn-primary btn-sm" onClick={suggest} disabled={suggesting}>{suggesting ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} Pino sugere a mala</button>
        </>
      ) : undefined} />

      {err && <div className="mb-4"><Notice tone="danger">{err}</Notice></div>}

      {suggestions && (
        <div className="card pino-border mb-5 p-4">
          <div className="mb-3 flex items-start gap-3">
            <PinoAvatar mood="achei" size={40} />
            <div><div className="font-bold">Achei {suggestions.length} itens pra vocês</div><p className="text-sm text-gray">{intro} Desmarque o que não quiser e adicione.</p></div>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <li key={i}>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={s.pick} onChange={(e) => setSuggestions((xs) => xs!.map((x, k) => (k === i ? { ...x, pick: e.target.checked } : x)))} />
                  <span className="flex-1">{s.label}</span>
                  <span className="text-[11px] text-gray">{s.list === "pre_viagem" ? "pré-viagem" : s.category}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={acceptSuggestions} disabled={busy}><Check size={16} /> Adicionar {suggestions.filter((s) => s.pick).length}</button>
            <button className="btn-ghost" onClick={() => setSuggestions(null)}>Descartar</button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2" role="tablist">
        {([["mala", "Mala", Luggage], ["pre_viagem", "Pré-viagem", ListChecks]] as const).map(([id, lbl, Icon]) => {
          const list = items.filter((i) => i.list === id);
          return (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={clsx("btn btn-sm border", tab === id ? "border-blue bg-blue text-white" : "border-line bg-white text-navy")}>
              <Icon size={14} /> {lbl} <span className="mono text-[11px] opacity-80">{list.filter((i) => i.done).length}/{list.length}</span>
            </button>
          );
        })}
      </div>

      {current.length > 0 && (
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-line" aria-label={`${doneCount} de ${current.length} concluídos`}>
          <div className="h-full bg-gradient-to-r from-blue to-teal transition-all" style={{ width: `${(doneCount / current.length) * 100}%` }} />
        </div>
      )}

      {canEdit && (
        <form onSubmit={add} className="card mb-5 grid gap-2 p-3 sm:grid-cols-[1fr_160px_auto]">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tab === "mala" ? "Adicionar item (ex.: adaptador de tomada)" : "Adicionar tarefa (ex.: reservar transfer)"} aria-label="Novo item" />
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria" aria-label="Categoria" list="checklist-cats" />
          <datalist id="checklist-cats">{[...new Set(items.map((i) => i.category))].map((c) => <option key={c} value={c} />)}</datalist>
          <button className="btn-primary" disabled={busy || !label.trim()}><Plus size={16} /> Adicionar</button>
          <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-3">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Item do grupo</label>
            {shared && (
              <select className="input w-auto min-w-40" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Responsável">
                <option value="">Sem responsável</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === myMemberId ? " (você)" : ""}</option>)}
              </select>
            )}
            {tab === "pre_viagem" && <label className="flex items-center gap-2">Prazo <input type="date" className="input w-auto" value={due} onChange={(e) => setDue(e.target.value)} /></label>}
          </div>
        </form>
      )}

      {current.length === 0 ? (
        <EmptyState title={tab === "mala" ? "A mala está vazia" : "Nenhuma tarefa pré-viagem"} text={tab === "mala" ? "Peça ao Pino uma sugestão pelo clima e pelas atividades do roteiro, ou adicione itens à mão." : "Use a checklist padrão (seguro, banco, câmbio, chip, ingressos, passaporte) com um clique."} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map(([cat, list]) => (
            <section key={cat} className="card p-4">
              <h2 className="label mb-2">{cat} · {list.filter((i) => i.done).length}/{list.length}</h2>
              <ul className="space-y-1">
                {list.map((it) => {
                  const overdue = it.due_date && !it.done && it.due_date < new Date().toISOString().slice(0, 10);
                  return (
                    <li key={it.id} className="flex items-center gap-2">
                      <button onClick={() => toggle(it)} className={clsx("flex min-h-11 flex-1 items-center gap-2.5 rounded-lg px-2 text-left text-sm hover:bg-ice", it.done && "text-gray line-through")} aria-pressed={it.done}>
                        <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", it.done ? "border-blue bg-blue text-white" : "border-line bg-white")}>{it.done && <Check size={12} />}</span>
                        <span className="flex-1">{it.label}</span>
                        {it.due_date && <Pill tone={overdue ? "danger" : "neutral"}>até {fmtDateShort(it.due_date)}</Pill>}
                        {it.shared && <Pill tone="teal"><Users size={10} /> {memberName(it.assignee) ?? "grupo"}</Pill>}
                      </button>
                      {canEdit && (
                        <>
                          <select className="sr-only focus:not-sr-only" value={it.assignee ?? ""} onChange={(e) => setAssigneeFor(it, e.target.value)} aria-label={`Responsável por ${it.label}`}>
                            <option value="">Sem responsável</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          <button className="btn-ghost w-10 px-0 text-gray hover:text-danger" onClick={() => remove(it)} aria-label={`Excluir ${it.label}`}><Trash2 size={14} /></button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
