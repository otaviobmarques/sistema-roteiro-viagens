"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { TripMap, type MapPoint } from "@/components/trip-map";
import { fmtDuration, fmtDateShort } from "@/lib/domain/time";
import type { Day, Destination, Item } from "@/lib/types";

export function TripMapView({ destinations, legs, days, items, saved }: {
  destinations: Destination[]; legs: { from: string; to: string; km: number; mode: string; minutes: number }[]; days: Day[]; items: Item[];
  saved: { id: string; name: string; lat: number; lng: number }[];
}) {
  const [view, setView] = useState<"viagem" | "dia">("viagem");
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [layers, setLayers] = useState({ roteiro: true, hospedagens: true, salvos: false });

  const points: MapPoint[] = useMemo(() => {
    if (view === "dia") {
      return items.filter((i) => i.day_id === dayId).sort((a, b) => a.position - b.position).map((i, idx) => ({ id: i.id, lat: i.lat!, lng: i.lng!, title: `${i.start_time ?? ""} ${i.title}`, label: String(idx + 1), tone: i.anchor ? "navy" : "blue" }));
    }
    const pts: MapPoint[] = destinations.map((d, i) => ({ id: d.id, lat: d.lat!, lng: d.lng!, title: d.city, label: String(i + 1), big: true, tone: "blue" }));
    if (layers.roteiro) items.filter((i) => i.kind !== "hospedagem" && i.kind !== "trajeto").forEach((i) => pts.push({ id: i.id, lat: i.lat!, lng: i.lng!, title: i.title, tone: "teal" }));
    if (layers.hospedagens) items.filter((i) => i.kind === "hospedagem").forEach((i) => pts.push({ id: i.id, lat: i.lat!, lng: i.lng!, title: `Hospedagem · ${i.title}`, tone: "navy" }));
    if (layers.salvos) saved.forEach((s) => pts.push({ id: `s-${s.id}`, lat: s.lat, lng: s.lng, title: `Salvo · ${s.name}`, tone: "warn" }));
    return pts;
  }, [view, dayId, items, destinations, layers, saved]);

  const totalKm = legs.reduce((s, l) => s + l.km, 0);
  const trains = legs.filter((l) => l.mode === "trem").length;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <div className="card p-4">
          <div className="label mb-2">Ordem da viagem</div>
          <ol className="space-y-2">
            {destinations.map((d, i) => (
              <li key={d.id}>
                <div className="flex items-center gap-2">
                  <span className="mono flex h-7 w-7 items-center justify-center rounded-lg bg-blue text-xs font-semibold text-white">{i + 1}</span>
                  <div><div className="text-sm font-semibold">{d.city}</div><div className="mono text-[11px] text-gray">{fmtDateShort(d.start_date)}–{fmtDateShort(d.end_date)} · {d.days} dia(s) · {items.filter((it) => days.find((x) => x.id === it.day_id)?.destination_id === d.id).length} lugares</div></div>
                </div>
                {legs[i] && <div className="mono ml-9 mt-1 text-[11px] uppercase text-blue">{legs[i].mode === "aviao" ? "voo" : legs[i].mode} {fmtDuration(legs[i].minutes)} · {legs[i].km} km</div>}
              </li>
            ))}
          </ol>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
            <div><div className="mono text-lg font-semibold">{items.length}</div><div className="label">lugares</div></div>
            <div><div className="mono text-lg font-semibold">{totalKm}</div><div className="label">km</div></div>
            <div><div className="mono text-lg font-semibold">{trains}</div><div className="label">trens</div></div>
          </div>
        </div>
        {view === "viagem" && (
          <div className="card space-y-2 p-4 text-sm">
            <div className="label">Camadas</div>
            {(["roteiro", "hospedagens", "salvos"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {k === "roteiro" ? "Roteiro" : k === "hospedagens" ? "Hospedagens" : "Lugares salvos"}</label>
            ))}
          </div>
        )}
      </aside>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl bg-white p-1 shadow-sm">
            {(["viagem", "dia"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={clsx("min-h-9 rounded-lg px-3 text-sm font-semibold", view === v ? "bg-blue text-white" : "text-gray")}>{v === "viagem" ? "Viagem inteira" : "Por dia"}</button>)}
          </div>
          {view === "dia" && <select className="input w-auto" value={dayId} onChange={(e) => setDayId(e.target.value)} aria-label="Dia">{days.map((d) => <option key={d.id} value={d.id}>Dia {d.position + 1}{d.date ? ` · ${fmtDateShort(d.date)}` : ""}</option>)}</select>}
        </div>
        <TripMap points={points} route={view === "dia"} height="min(72vh, 680px)" />
        <p className="text-[11px] text-gray">O modo offline com mapas baixados entra na versão do app. Dados de lugares: © OpenStreetMap e Wikidata.</p>
      </div>
    </div>
  );
}
