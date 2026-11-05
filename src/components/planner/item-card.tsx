"use client";
import { useState } from "react";
import clsx from "clsx";
import { ChevronUp, ChevronDown, Lock, Trash2, Info, Shuffle, GripVertical, MapPin, Utensils, Bed, Train, StickyNote, Clock, Check } from "lucide-react";
import { ScoreBadge, Pill } from "@/components/ui";
import { badge } from "@/lib/domain/score";
import { fmtBRL } from "@/lib/domain/settle";
import { fmtDuration, fmtDateShort } from "@/lib/domain/time";
import { PROFILE_LABEL } from "@/lib/labels";
import type { Conflict } from "@/lib/domain/schedule";
import type { Item, ItemOption, Day } from "@/lib/types";

const KIND_ICON = { lugar: MapPin, atividade: MapPin, refeicao: Utensils, hospedagem: Bed, trajeto: Train, nota: StickyNote, livre: Clock } as const;
const MODES = [["a_pe", "A pé"], ["transporte", "Transporte público"], ["taxi", "Táxi/app"], ["carro", "Carro"], ["bicicleta", "Bicicleta"], ["trem", "Trem"], ["aviao", "Avião"]];

export function ItemCard(p: {
  item: Item & { start: string; end: string }; index: number; total: number; conflicts: Conflict[]; options: ItemOption[]; days: Day[]; canEdit: boolean;
  selected: boolean; onSelect: () => void; onMove: (to: number) => void; onMoveDay: (dayId: string | null) => void; onUpdate: (patch: Partial<Item>) => void; onRemove: () => void; onSwap: (o: ItemOption) => void;
}) {
  const { item: it } = p;
  const [open, setOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const Icon = KIND_ICON[it.kind] ?? MapPin;
  const high = p.conflicts.some((c) => c.severity === "alta");
  const b = badge(it.score);

  return (
    <div className={clsx("card overflow-hidden", high && "border-warn/60", p.selected && "ring-2 ring-blue/40", it.done && "opacity-60")} onClick={p.onSelect}>
      <div className="flex items-start gap-2 p-3">
        {p.canEdit && <GripVertical size={16} className="mt-1 shrink-0 cursor-grab text-gray/50" aria-hidden />}
        <div className={clsx("mono w-12 shrink-0 text-sm font-semibold", high ? "text-warn" : "text-navy")}>{it.start}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Icon size={14} className="text-blue" />
            <span className="font-semibold">{it.title}</span>
            {it.anchor && <Pill tone="neutral"><Lock size={10} /> Fixo {it.anchor_time}</Pill>}
            {it.must_have && <Pill tone="teal">não abro mão</Pill>}
            {!it.verified && it.kind !== "nota" && it.kind !== "livre" && <Pill tone="warn">não verificado</Pill>}
            {b && <Pill tone="blue">{b.label}</Pill>}
          </div>
          <div className="mono mt-0.5 text-[11px] text-gray">
            {fmtDuration(it.duration_min)}{it.cost_cents ? ` · ${fmtBRL(it.cost_cents)}` : ""}{it.category ? ` · ${it.category}` : ""}{it.opening_hours ? ` · ${it.opening_hours}` : ""}
          </div>
          {p.conflicts.map((c, i) => <div key={i} className="mt-1 text-xs text-warn">{c.message}</div>)}
          {showWhy && it.why && <div className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-xs text-navy"><b>Por que o Pino escolheu:</b> {it.why}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); setShowWhy(!showWhy); }} aria-label="Por que o Pino escolheu" title="Por que o Pino escolheu"><ScoreBadge score={it.score} /></button>
          {it.done && <Check size={14} className="text-ok" />}
        </div>
      </div>
      {p.canEdit && (
        <div className="flex flex-wrap items-center gap-1 border-t border-line bg-ice/50 px-2 py-1">
          <button className="btn-ghost btn-sm w-9 px-0" disabled={p.index === 0} onClick={(e) => { e.stopPropagation(); p.onMove(p.index - 1); }} aria-label="Subir"><ChevronUp size={14} /></button>
          <button className="btn-ghost btn-sm w-9 px-0" disabled={p.index === p.total - 1} onClick={(e) => { e.stopPropagation(); p.onMove(p.index + 1); }} aria-label="Descer"><ChevronDown size={14} /></button>
          {p.options.length > 0 && <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(open ? false : true); }}><Shuffle size={13} /> Trocar ({p.options.length})</button>}
          <details className="relative" onClick={(e) => e.stopPropagation()}>
            <summary className="btn-ghost btn-sm cursor-pointer list-none"><Info size={13} /> Editar</summary>
            <div className="absolute left-0 z-20 mt-1 w-72 space-y-2 rounded-xl border border-line bg-white p-3 shadow-[var(--shadow-pop)]">
              <label className="block text-xs font-semibold">Título<input className="input mt-1" defaultValue={it.title} onBlur={(e) => e.target.value !== it.title && p.onUpdate({ title: e.target.value })} /></label>
              <label className="block text-xs font-semibold">Duração (min)<input type="number" min={5} step={5} className="input mt-1" defaultValue={it.duration_min} onBlur={(e) => Number(e.target.value) !== it.duration_min && p.onUpdate({ duration_min: Math.max(5, Number(e.target.value)) })} /></label>
              <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={it.anchor} onChange={(e) => p.onUpdate({ anchor: e.target.checked, anchor_time: e.target.checked ? it.anchor_time || it.start : null })} /> Horário fixo (âncora)</label>
              {it.anchor && <input type="time" className="input" defaultValue={it.anchor_time ?? it.start} onBlur={(e) => p.onUpdate({ anchor_time: e.target.value })} aria-label="Horário fixo" />}
              <label className="block text-xs font-semibold">Como chegar<select className="input mt-1" value={it.transport_mode ?? "a_pe"} onChange={(e) => p.onUpdate({ transport_mode: e.target.value })}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block text-xs font-semibold">Mover para<select className="input mt-1" value={it.day_id ?? ""} onChange={(e) => p.onMoveDay(e.target.value || null)}>
                {p.days.map((d) => <option key={d.id} value={d.id}>Dia {d.position + 1} {d.date ? `· ${fmtDateShort(d.date)}` : ""}</option>)}
                <option value="">Lista de ideias</option>
              </select></label>
              <label className="block text-xs font-semibold">Notas<textarea className="input mt-1 min-h-14 py-2" defaultValue={it.notes ?? ""} onBlur={(e) => p.onUpdate({ notes: e.target.value })} /></label>
            </div>
          </details>
          {it.lat != null && <a className="btn-ghost btn-sm" href={`https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Navegar</a>}
          <button className="btn-ghost btn-sm ml-auto w-9 px-0 text-danger" onClick={(e) => { e.stopPropagation(); p.onRemove(); }} aria-label={`Excluir ${it.title}`}><Trash2 size={14} /></button>
        </div>
      )}
      {open && (
        <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
          {p.options.map((o) => (
            <button key={o.id} onClick={(e) => { e.stopPropagation(); p.onSwap(o); setOpen(false); }} className={clsx("rounded-xl border p-2.5 text-left text-sm", o.chosen ? "border-blue bg-blue-50" : "border-line hover:border-blue/40")}>
              <div className="flex items-center justify-between gap-2"><Pill tone={o.travel_profile === "experiencia" ? "warn" : o.travel_profile === "mochilao" ? "teal" : "blue"}>{PROFILE_LABEL[o.travel_profile]}</Pill><ScoreBadge score={o.score} /></div>
              <div className="mt-1 font-semibold">{o.title}</div>
              <div className="mono text-[11px] text-gray">{o.est_price_cents != null ? fmtBRL(o.est_price_cents) : ""} {o.reason ? `· ${o.reason}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
