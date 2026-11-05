"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Bookmark, BookmarkCheck, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { INTEREST_CATEGORIES } from "@/lib/domain/score";
import { TripMap } from "@/components/trip-map";
import { EmptyState, Notice, Pill } from "@/components/ui";

type Place = { id: string; name: string; lat: number; lng: number; category: string; interest: string | null; type: string; price_level: number | null; opening_hours: string | null; notability: number; website: string | null; wikidata: string | null };
type Result = { city: string; country: string | null; center: { lat: number; lng: number }; source: string; places: Place[] };

const TYPES = [
  { id: "atracao", label: "Atrações" },
  { id: "restaurante", label: "Comer e beber" },
  { id: "hospedagem", label: "Hospedagem" },
  { id: "experiencia", label: "Experiências" },
];

export function Explorer({ userId, initialQuery, trips, savedIds }: { userId: string; initialQuery: string; trips: { id: string; title: string }[]; savedIds: string[] }) {
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [type, setType] = useState("atracao");
  const [interest, setInterest] = useState<string | null>(null);
  const [saved, setSaved] = useState(new Set(savedIds));
  const [selected, setSelected] = useState<string | null>(null);
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const [toast, setToast] = useState<string | null>(null);

  const search = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/places?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha na busca");
      setRes(data);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na busca");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialQuery) search(initialQuery); }, [initialQuery]);

  const list = useMemo(() => (res?.places ?? []).filter((p) => p.type === type && (!interest || p.interest === interest)).slice(0, 80), [res, type, interest]);

  const toggleSave = async (p: Place) => {
    const sb = supabaseBrowser();
    const next = new Set(saved);
    if (saved.has(p.id)) { next.delete(p.id); await sb.from("saved_places").delete().eq("user_id", userId).eq("place_id", p.id); }
    else { next.add(p.id); await sb.from("saved_places").insert({ user_id: userId, place_id: p.id }); }
    setSaved(next);
  };

  const addToIdeas = async (p: Place) => {
    if (!tripId) return;
    const { error: e } = await supabaseBrowser().from("itinerary_items").insert({
      trip_id: tripId, day_id: null, kind: p.type === "restaurante" ? "refeicao" : p.type === "hospedagem" ? "hospedagem" : "lugar",
      title: p.name, place_id: p.id, lat: p.lat, lng: p.lng, category: p.category, interest_category: p.interest, opening_hours: p.opening_hours,
      duration_min: p.type === "restaurante" ? 75 : 90, verified: true, created_by: userId,
    });
    setToast(e ? `Não foi possível adicionar: ${e.message}` : `“${p.name}” foi para a lista de ideias da viagem.`);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); search(q); }} className="flex gap-2" role="search">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cidade, ex.: Lisboa, Gramado, Buenos Aires" aria-label="Cidade" />
        <button className="btn-primary" disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar</button>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      {toast && <Notice tone="ok">{toast}</Notice>}

      {!res && !loading && <EmptyState title="Para onde vamos?" text="Busque uma cidade para ver atrações, restaurantes e hospedagens da nossa base, com dados do OpenStreetMap e do Wikidata." />}

      {res && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{res.city}{res.country ? `, ${res.country}` : ""}</h2>
            <span className="text-xs text-gray">{res.places.length} lugares · fonte: {res.source === "wikidata" ? "Wikidata" : "OpenStreetMap"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tipo de lugar">
            {TYPES.map((t) => (
              <button key={t.id} role="tab" aria-selected={type === t.id} onClick={() => setType(t.id)} className={clsx("chip min-h-9", type === t.id && "border-blue bg-blue-50 text-blue")}>{t.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por interesse">
            <button onClick={() => setInterest(null)} className={clsx("chip", !interest && "border-blue text-blue")}>Todos</button>
            {INTEREST_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setInterest(c.id === interest ? null : c.id)} className={clsx("chip", interest === c.id && "border-blue bg-blue-50 text-blue")}>{c.label}</button>
            ))}
          </div>
          {trips.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">Adicionar ideias em
              <select className="input w-auto" value={tripId} onChange={(e) => setTripId(e.target.value)}>
                {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
          )}
          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <ul className="space-y-2 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {!list.length && <li><Notice tone="blue">Nada nessa combinação de filtros.</Notice></li>}
              {list.map((p) => (
                <li key={p.id} className={clsx("card p-3", selected === p.id && "ring-4 ring-blue/15")} onMouseEnter={() => setSelected(p.id)}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{p.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray">
                        <span className="capitalize">{p.category}</span>
                        {p.price_level && <span className="mono">{"$".repeat(p.price_level)}</span>}
                        {p.notability >= 7 && <Pill tone="blue">Referência</Pill>}
                        {p.opening_hours && <span className="mono truncate" title={p.opening_hours}>{p.opening_hours}</span>}
                      </div>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => toggleSave(p)} aria-label={saved.has(p.id) ? "Remover dos salvos" : "Salvar"}>
                      {saved.has(p.id) ? <BookmarkCheck size={16} className="text-blue" /> : <Bookmark size={16} />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {trips.length > 0 && <button className="btn-secondary btn-sm" onClick={() => addToIdeas(p)}><Plus size={14} /> Lista de ideias</button>}
                    {p.website && <a className="btn-ghost btn-sm" href={p.website} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Site</a>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="lg:sticky lg:top-20 lg:self-start">
              <TripMap points={list.map((p, i) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.name, label: String(i + 1), tone: selected === p.id ? "teal" : "blue" }))} route={false} selectedId={selected} onSelect={setSelected} height={520} />
              <p className="mt-1 text-[11px] text-gray">Dados © colaboradores do OpenStreetMap (ODbL) e Wikidata (CC0).</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
