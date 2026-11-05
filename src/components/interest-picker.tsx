"use client";
import clsx from "clsx";
import { Mountain, Landmark, UtensilsCrossed, Waves, Martini, ShoppingBag, Heart, Music, Home, Camera, Star, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Mountain, Landmark, UtensilsCrossed, Waves, Martini, ShoppingBag, Heart, Music, Home, Camera };
import { INTEREST_CATEGORIES, WEIGHT_LABELS, interestTimeShare } from "@/lib/domain/score";

/** Interesses com peso (RF-200/201): toque para escolher; toques seguintes alternam Gosto → Curto muito → Amo → desmarca. */
export function InterestPicker({ value, onChange, compact }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void; compact?: boolean }) {
  const cycle = (id: string) => {
    const cur = value[id] ?? 0;
    const next = cur >= 3 ? 0 : cur + 1;
    const v = { ...value };
    if (next === 0) delete v[id];
    else v[id] = next;
    onChange(v);
  };
  const share = interestTimeShare(value);
  return (
    <div>
      <div className={clsx("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
        {INTEREST_CATEGORIES.map((c) => {
          const w = value[c.id] ?? 0;
          const Icon = ICONS[c.icon] ?? Star;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => cycle(c.id)}
              aria-pressed={w > 0}
              className={clsx("rounded-xl border bg-white p-3 text-left transition", w ? "border-blue/50 shadow-[var(--shadow-card)]" : "border-line hover:border-blue/30")}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", w ? "bg-blue-50 text-blue" : "bg-ice text-gray")}><Icon size={16} /></span>
                {w > 0 && <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue">{WEIGHT_LABELS[w]}</span>}
              </div>
              <div className="mt-2 text-sm font-semibold leading-tight">{c.label}</div>
              {w > 0 ? (
                <div className="mt-2 flex gap-1">{[1, 2, 3].map((n) => <span key={n} className={clsx("h-1 flex-1 rounded-full", n <= w ? "bg-blue" : "bg-line")} />)}</div>
              ) : (
                <div className="mt-1 text-[11px] text-gray">Toque para escolher</div>
              )}
            </button>
          );
        })}
      </div>
      {share.length > 0 && (
        <div className="card mt-3 p-3">
          <div className="label mb-2">Seu tempo vai ficar assim</div>
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {share.map((s, i) => <div key={s.id} style={{ width: `${s.pct}%`, background: ["#205BFF", "#11C2C8", "#0A1F4C", "#5B8CFF", "#7FDDE0", "#3A4D7A"][i % 6] }} />)}
          </div>
          <div className="mono mt-2 text-[11px] text-gray">{share.map((s) => `${INTEREST_CATEGORIES.find((c) => c.id === s.id)?.label.split(" ")[0].toLowerCase()} ${s.pct}%`).join(" · ")}</div>
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-xl bg-ice p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.value} key={o.value} onClick={() => onChange(o.value)}
          className={clsx("min-h-10 rounded-lg px-2 text-sm font-semibold", value === o.value ? "bg-white text-navy shadow-sm" : "text-gray")}>{o.label}</button>
      ))}
    </div>
  );
}
