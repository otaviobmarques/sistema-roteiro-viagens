"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Wand2, Undo2, Redo2, AlertTriangle, CloudRain, Sun, Lightbulb, RefreshCw, Feather, PiggyBank, Loader2, MessageCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cascade, optimizeDay, type Conflict } from "@/lib/domain/schedule";
import { suggestMode } from "@/lib/domain/geo";
import { TripPlaces } from "@/lib/domain/dedupe";
import { fmtDuration, weekdayShort, fmtDateShort } from "@/lib/domain/time";
import { fmtBRL } from "@/lib/domain/settle";
import { weatherLabel } from "@/lib/context";
import { TripMap } from "@/components/trip-map";
import { Notice, PinoAvatar, EmptyState } from "@/components/ui";
import type { Day, Item, ItemOption, Trip, Destination } from "@/lib/types";
import { ItemCard } from "./item-card";
import { AddItem } from "./add-item";
import { PinoPanel } from "./pino-panel";

type Props = {
  trip: Trip; userId: string; days: Day[]; items: Item[]; options: ItemOption[]; destinations: Destination[]; canEdit: boolean; pace: string; profile: string;
  weatherByDate: Record<string, { rain: number | null; tmax: number | null; tmin: number | null; code: number | null }>;
  initialPino: string | null; justGenerated: boolean; lastGeneration: Record<string, unknown> | null; initialDayId: string | null;
};

export function Planner(p: Props) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(p.items);
  const [options, setOptions] = useState<ItemOption[]>(p.options);
  const [dayId, setDayId] = useState<string | null>(p.initialDayId && p.days.some((d) => d.id === p.initialDayId) ? p.initialDayId : p.days[0]?.id ?? null);
  const [history, setHistory] = useState<Item[][]>([]);
  const [future, setFuture] = useState<Item[][]>([]);
  const [suggestion, setSuggestion] = useState<{ items: Item[]; saved: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinoOpen, setPinoOpen] = useState(!!p.initialPino);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "blue"; text: string } | null>(
    p.justGenerated ? { tone: "ok", text: "Achei! Seu roteiro está pronto. Toque no score de cada item para ver o porquê e troque o que quiser." } : null,
  );
  const dragId = useRef<string | null>(null);
  const savingRef = useRef(false);

  const day = p.days.find((d) => d.id === dayId) ?? null;
  const dayItems = useMemo(() => items.filter((i) => i.day_id === dayId).sort((a, b) => a.position - b.position), [items, dayId]);
  const ideas = useMemo(() => items.filter((i) => !i.day_id), [items]);
  const w = day?.date ? p.weatherByDate[day.date] : undefined;
  const dest = p.destinations.find((d) => d.id === day?.destination_id);
  const ctx = useMemo(() => ({ date: day?.date, dayStart: day?.day_start || "09:00", pace: p.pace, rainProbability: w?.rain ?? null }), [day, p.pace, w]);
  const computed = useMemo(() => cascade(dayItems, ctx), [dayItems, ctx]);
  const conflictsByItem = useMemo(() => {
    const m = new Map<string, Conflict[]>();
    computed.conflicts.forEach((c) => { if (c.itemId) m.set(c.itemId, [...(m.get(c.itemId) ?? []), c]); });
    return m;
  }, [computed]);

  // Tempo real (RF-082): recarrega itens quando alguém do grupo edita
  useEffect(() => {
    const ch = sb.channel(`trip:${p.trip.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary_items", filter: `trip_id=eq.${p.trip.id}` }, async () => {
        if (savingRef.current) return;
        const { data } = await sb.from("itinerary_items").select("*").eq("trip_id", p.trip.id).order("position");
        if (data) setItems(data as Item[]);
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, p.trip.id]);

  /** Grava a ordem e os horários calculados pela cascata para os itens dos dias afetados. */
  const persist = useCallback(async (next: Item[], affectedDays: (string | null)[]) => {
    savingRef.current = true;
    try {
      const updates: Promise<unknown>[] = [];
      for (const d of new Set(affectedDays)) {
        const list = next.filter((i) => i.day_id === d).sort((a, b) => a.position - b.position);
        const dd = p.days.find((x) => x.id === d);
        const res = d ? cascade(list, { date: dd?.date, dayStart: dd?.day_start || "09:00", pace: p.pace }) : null;
        list.forEach((it, idx) => {
          const r = res?.items[idx];
          updates.push(sb.from("itinerary_items").update({ day_id: it.day_id, position: idx, start_time: r?.start ?? null, travel_min: r?.travel_before ?? null, duration_min: it.duration_min, anchor: it.anchor, anchor_time: it.anchor_time, transport_mode: it.transport_mode, title: it.title, notes: it.notes, kind: it.kind, lat: it.lat, lng: it.lng, place_id: it.place_id, cost_cents: it.cost_cents, score: it.score, why: it.why, done: it.done, travel_profile: it.travel_profile }).eq("id", it.id));
        });
      }
      const results = await Promise.all(updates);
      const failed = results.find((r) => (r as { error?: { message: string } }).error);
      if (failed) setMsg({ tone: "danger", text: "Não foi possível salvar: " + (failed as { error: { message: string } }).error.message });
    } finally {
      setTimeout(() => { savingRef.current = false; }, 800);
    }
  }, [sb, p.days, p.pace]);

  const commit = useCallback((next: Item[], affected: (string | null)[]) => {
    setHistory((h) => [...h.slice(-30), items]);
    setFuture([]);
    setItems(next);
    persist(next, affected);
  }, [items, persist]);

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setFuture((f) => [items, ...f]);
    setHistory((h) => h.slice(0, -1));
    setItems(prev);
    persist(prev, [...new Set([...prev, ...items].map((i) => i.day_id))]);
  };
  const redo = () => {
    const nxt = future[0];
    if (!nxt) return;
    setHistory((h) => [...h, items]);
    setFuture((f) => f.slice(1));
    setItems(nxt);
    persist(nxt, [...new Set([...nxt, ...items].map((i) => i.day_id))]);
  };

  const reorder = (id: string, toIndex: number, toDay: string | null = dayId) => {
    const moving = items.find((i) => i.id === id);
    if (!moving) return;
    if (moving.anchor && moving.day_id === toDay) {
      // âncoras podem ser movidas manualmente; o horário fixo continua valendo
    }
    const fromDay = moving.day_id;
    const target = items.filter((i) => i.day_id === toDay && i.id !== id).sort((a, b) => a.position - b.position);
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, { ...moving, day_id: toDay });
    const repositioned = new Map(target.map((it, idx) => [it.id, { ...it, position: idx }]));
    let next = items.map((i) => repositioned.get(i.id) ?? i);
    if (fromDay !== toDay) {
      const src = next.filter((i) => i.day_id === fromDay).sort((a, b) => a.position - b.position);
      const srcMap = new Map(src.map((it, idx) => [it.id, { ...it, position: idx }]));
      next = next.map((i) => srcMap.get(i.id) ?? i);
    }
    commit(next, [fromDay, toDay]);
  };

  const updateItem = (id: string, patch: Partial<Item>) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    commit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)), [it.day_id]);
  };

  const removeItem = async (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    if (it.must_have && !confirm(`"${it.title}" está na lista "não abro mão". Tirar mesmo assim?`)) return;
    setHistory((h) => [...h, items]);
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    savingRef.current = true;
    await sb.from("itinerary_items").delete().eq("id", id);
    persist(next, [it.day_id]);
  };

  const addItem = async (draft: Partial<Item>, toDay: string | null) => {
    const dup = draft.title ? items.find((i) => i.day_id && TripPlaces.from([i], p.destinations.map((d) => d.city)).has({ place_id: draft.place_id ?? null, title: draft.title!, kind: draft.kind ?? "lugar" })) : undefined;
    if (dup) {
      const dn = p.days.findIndex((d) => d.id === dup.day_id) + 1;
      if (!confirm(`"${dup.title}" já está no roteiro (dia ${dn}). Adicionar de novo mesmo assim?`)) return;
    }
    const sameDay = items.filter((i) => i.day_id === toDay).sort((a, b) => a.position - b.position);
    const pos = sameDay.length;
    const prev = sameDay.at(-1);
    if (!draft.transport_mode && prev?.lat != null && draft.lat != null && draft.lng != null) {
      draft = { ...draft, transport_mode: suggestMode({ lat: prev.lat, lng: prev.lng! }, { lat: draft.lat, lng: draft.lng }, p.profile) };
    }
    savingRef.current = true;
    const { data, error } = await sb.from("itinerary_items").insert({ trip_id: p.trip.id, day_id: toDay, position: pos, created_by: p.userId, duration_min: 60, kind: "lugar", ...draft }).select("*").single();
    if (error) { setMsg({ tone: "danger", text: error.message }); return; }
    const next = [...items, data as Item];
    setHistory((h) => [...h, items]);
    setItems(next);
    persist(next, [toDay]);
  };

  const swapOption = (itemId: string, opt: ItemOption) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    setOptions((os) => os.map((o) => (o.item_id === itemId ? { ...o, chosen: o.id === opt.id } : o)));
    sb.from("item_options").update({ chosen: false }).eq("item_id", itemId).then(() => sb.from("item_options").update({ chosen: true }).eq("id", opt.id));
    updateItem(itemId, { title: opt.title, place_id: opt.place_id, lat: opt.lat, lng: opt.lng, score: opt.score, cost_cents: opt.est_price_cents, travel_profile: opt.travel_profile, why: opt.reason });
  };

  const runOptimize = () => {
    const r = optimizeDay(dayItems, ctx);
    if (!r.changed) { setMsg({ tone: "blue", text: "Esse dia já está na melhor ordem que encontrei, respeitando os horários fixos." }); return; }
    setSuggestion({ items: r.items, saved: r.savedMinutes });
  };
  const applySuggestion = () => {
    if (!suggestion) return;
    const pos = new Map(suggestion.items.map((it, i) => [it.id, i]));
    commit(items.map((i) => (pos.has(i.id) ? { ...i, position: pos.get(i.id)! } : i)), [dayId]);
    setSuggestion(null);
  };

  const redoDay = async (mode: "refazer" | "leve" | "barato") => {
    if (!dayId) return;
    setBusyDay(mode);
    setMsg(null);
    const r = await fetch(`/api/trips/${p.trip.id}/redo-day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayId, mode }) });
    const d = await r.json().catch(() => ({ error: "Erro inesperado" }));
    setBusyDay(null);
    if (!r.ok) { setMsg({ tone: "danger", text: d.error }); return; }
    setHistory((h) => [...h, items]);
    const { data } = await sb.from("itinerary_items").select("*").eq("trip_id", p.trip.id).order("position");
    if (data) setItems(data as Item[]);
    setMsg({ tone: "ok", text: d.message || "Achei uma nova versão para o dia. Dá para desfazer." });
  };

  const points = computed.items.filter((i) => i.lat != null && i.lng != null).map((i, idx) => ({
    id: i.id, lat: i.lat!, lng: i.lng!, title: `${i.start} · ${i.title}`, label: String(idx + 1),
    tone: (conflictsByItem.get(i.id)?.some((c) => c.severity === "alta") ? "warn" : i.anchor ? "navy" : "blue") as "warn" | "navy" | "blue",
  }));

  if (!p.days.length) {
    return <EmptyState title="Defina as datas da viagem" text="Com as datas eu crio os dias e você começa a montar o roteiro." action={<a className="btn-primary" href={`/app/viagem/${p.trip.id}/config`}>Definir datas</a>} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Dias">
          {p.days.map((d) => {
            const n = items.filter((i) => i.day_id === d.id).length;
            return (
              <button key={d.id} role="tab" aria-selected={d.id === dayId} onClick={() => { setDayId(d.id); setSuggestion(null); }}
                className={clsx("min-w-14 rounded-xl border px-2.5 py-1.5 text-center", d.id === dayId ? "border-blue bg-blue text-white" : "border-line bg-white")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId.current) reorder(dragId.current, 999, d.id); dragId.current = null; }}>
                <div className="text-[11px] font-semibold capitalize">{d.date ? weekdayShort(d.date) : `Dia`}</div>
                <div className="mono text-sm font-semibold">{d.date ? fmtDateShort(d.date).slice(0, 2) : d.position + 1}</div>
                <div className={clsx("mx-auto mt-0.5 h-1 w-1 rounded-full", n ? (d.id === dayId ? "bg-white" : "bg-blue") : "bg-transparent")} />
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold">Dia {(day?.position ?? 0) + 1} · {day?.title || dest?.city || "Sem título"}</h2>
            <div className="mono flex flex-wrap items-center gap-x-2 text-[11px] uppercase text-gray">
              <span>{dayItems.length} paradas</span>·<span>{computed.walkKm.toFixed(1)} km a pé</span>·<span>{fmtDuration(computed.travelMinutes)} em trajetos</span>
              {computed.costCents > 0 && <>·<span>{fmtBRL(computed.costCents)} p/ pessoa</span></>}
              {w && <>·<span className="inline-flex items-center gap-1">{(w.rain ?? 0) > 50 ? <CloudRain size={12} /> : <Sun size={12} />}{Math.round(w.tmax ?? 0)}°C · {w.rain ?? 0}% chuva · {weatherLabel(w.code)}</span></>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn-secondary btn-sm w-9 px-0" onClick={undo} disabled={!history.length} aria-label="Desfazer" title="Desfazer"><Undo2 size={14} /></button>
            <button className="btn-secondary btn-sm w-9 px-0" onClick={redo} disabled={!future.length} aria-label="Refazer" title="Refazer"><Redo2 size={14} /></button>
            {p.canEdit && <button className="btn-secondary btn-sm" onClick={runOptimize} disabled={dayItems.length < 3}><Wand2 size={14} /> Otimizar ordem</button>}
            <button className="btn-primary btn-sm" onClick={() => setPinoOpen(true)}><MessageCircle size={14} /> Pino</button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="label">Viabilidade do dia</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className={clsx("h-full rounded-full", computed.score >= 85 ? "bg-ok" : computed.score >= 60 ? "bg-warn" : "bg-danger")} style={{ width: `${computed.score}%` }} /></div>
          <span className="mono text-sm font-semibold">{computed.score}</span>
        </div>

        {msg && <Notice tone={msg.tone === "ok" ? "ok" : msg.tone === "danger" ? "danger" : "blue"}><div className="flex items-start gap-2">{msg.tone === "ok" && <PinoAvatar mood="achei" size={22} />}<span className="flex-1">{msg.text}</span><button onClick={() => setMsg(null)} className="text-xs font-semibold">fechar</button></div></Notice>}

        {computed.conflicts.length > 0 && (
          <div className="space-y-1.5">
            {computed.conflicts.map((c, i) => (
              <div key={i} className={clsx("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", c.severity === "alta" ? "border-danger/30 bg-danger-50" : c.severity === "media" ? "border-warn/30 bg-warn-50" : "border-line bg-white")}>
                <AlertTriangle size={15} className={clsx("mt-0.5 shrink-0", c.severity === "alta" ? "text-danger" : "text-warn")} />
                <div className="flex-1"><b>Conflito:</b> {c.message} <span className="text-gray">{c.fix}</span></div>
                {p.canEdit && c.type === "dia_puxado" && <button className="text-xs font-semibold text-blue" onClick={() => redoDay("leve")}>Resolver</button>}
                {p.canEdit && (c.type === "nao_da_tempo" || c.type === "sobreposicao") && <button className="text-xs font-semibold text-blue" onClick={runOptimize}>Resolver</button>}
              </div>
            ))}
          </div>
        )}

        {suggestion && (
          <div className="pino-border flex flex-wrap items-center gap-3 rounded-2xl p-3">
            <PinoAvatar mood="achei" size={30} />
            <div className="flex-1 text-sm"><b>Pino sugere</b> uma nova ordem: economiza <span className="mono font-semibold">{suggestion.saved} min</span> de deslocamento, sem mexer nos horários fixos.</div>
            <button className="btn-primary btn-sm" onClick={applySuggestion}>Aplicar</button>
            <button className="btn-secondary btn-sm" onClick={() => setSuggestion(null)}>Descartar</button>
          </div>
        )}

        <ol className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId.current) reorder(dragId.current, dayItems.length); dragId.current = null; }}>
          {computed.items.map((it, idx) => {
            const free = computed.freeBlocks.find((f) => f.after === computed.items[idx - 1]?.id && idx > 0);
            return (
              <li key={it.id}
                draggable={p.canEdit}
                onDragStart={() => { dragId.current = it.id; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); if (dragId.current && dragId.current !== it.id) reorder(dragId.current, idx); dragId.current = null; }}>
                {idx > 0 && it.travel_before > 0 && <div className="mono py-1 pl-6 text-[11px] text-gray">↓ {it.transport_mode === "a_pe" ? "a pé" : it.transport_mode?.replace("_", " ")} · {it.travel_before} min</div>}
                {free && free.minutes >= 30 && <div className="mb-2 rounded-xl border border-dashed border-teal/50 bg-teal-50/50 px-3 py-2 text-xs text-[#0b7f84]">Tempo livre {free.start}–{free.end} ({fmtDuration(free.minutes)})</div>}
                <ItemCard
                  item={it}
                  index={idx}
                  total={computed.items.length}
                  conflicts={conflictsByItem.get(it.id) ?? []}
                  options={options.filter((o) => o.item_id === it.id)}
                  days={p.days}
                  canEdit={p.canEdit}
                  selected={selected === it.id}
                  onSelect={() => setSelected(it.id)}
                  onMove={(to) => reorder(it.id, to)}
                  onMoveDay={(d) => reorder(it.id, 999, d)}
                  onUpdate={(patch) => updateItem(it.id, patch)}
                  onRemove={() => removeItem(it.id)}
                  onSwap={(o) => swapOption(it.id, o)}
                />
              </li>
            );
          })}
        </ol>

        {p.canEdit && <AddItem dest={dest ?? null} onAdd={(draft) => addItem(draft, dayId)} />}

        {p.canEdit && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => redoDay("refazer")} disabled={!!busyDay}>{busyDay === "refazer" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refazer este dia</button>
            <button className="btn-secondary btn-sm" onClick={() => redoDay("leve")} disabled={!!busyDay}>{busyDay === "leve" ? <Loader2 size={14} className="animate-spin" /> : <Feather size={14} />} Deixar mais leve</button>
            <button className="btn-secondary btn-sm" onClick={() => redoDay("barato")} disabled={!!busyDay}>{busyDay === "barato" ? <Loader2 size={14} className="animate-spin" /> : <PiggyBank size={14} />} Mais barato</button>
          </div>
        )}

        <section className="card p-4" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId.current) reorder(dragId.current, 999, null); dragId.current = null; }}>
          <div className="mb-2 flex items-center gap-2"><Lightbulb size={16} className="text-blue" /><h3 className="font-bold">Lista de ideias</h3><span className="text-xs text-gray">lugares sem dia, para encaixar depois</span></div>
          {ideas.length === 0 ? <p className="text-sm text-gray">Arraste um item para cá ou adicione pelo Explorar lugares.</p> : (
            <ul className="space-y-1.5">
              {ideas.map((it) => (
                <li key={it.id} draggable={p.canEdit} onDragStart={() => { dragId.current = it.id; }} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="flex-1 font-medium">{it.title}</span>
                  {p.canEdit && <button className="btn-secondary btn-sm" onClick={() => reorder(it.id, 999, dayId)}>Encaixar no dia</button>}
                  {p.canEdit && <button className="btn-ghost btn-sm" onClick={() => removeItem(it.id)} aria-label="Excluir ideia">×</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <div className="relative">
          <TripMap points={points} height="min(70vh, 620px)" selectedId={selected} onSelect={setSelected} />
          {pinoOpen && (
            <div className="absolute inset-x-2 bottom-2 top-2 sm:left-auto sm:w-[380px]">
              <PinoPanel tripId={p.trip.id} dayId={dayId} initial={p.initialPino} onClose={() => setPinoOpen(false)} onApplied={async () => {
                setHistory((h) => [...h, items]);
                const { data } = await sb.from("itinerary_items").select("*").eq("trip_id", p.trip.id).order("position");
                if (data) setItems(data as Item[]);
                router.refresh();
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
