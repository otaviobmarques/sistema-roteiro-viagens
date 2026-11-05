"use client";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Destination, Item } from "@/lib/types";

type PlaceRow = { id: string; name: string; lat: number; lng: number; category: string | null; interest_category: string | null; opening_hours: string | null; tags: { outdoor?: boolean } | null };

/** Adiciona lugar (da base própria), refeição, nota, tempo livre ou trajeto. */
export function AddItem({ dest, onAdd }: { dest: Destination | null; onAdd: (draft: Partial<Item>) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Item["kind"]>("lugar");
  const [results, setResults] = useState<PlaceRow[]>([]);
  const sb = supabaseBrowser();

  useEffect(() => {
    if (!open || q.length < 2 || !["lugar", "refeicao", "hospedagem", "atividade"].includes(kind)) { setResults([]); return; }
    const t = setTimeout(async () => {
      let query = sb.from("places").select("id, name, lat, lng, category, interest_category, opening_hours, tags").ilike("name", `%${q}%`).limit(8);
      if (dest?.city) query = query.eq("city", dest.city.toLowerCase());
      const { data } = await query;
      setResults((data ?? []) as PlaceRow[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, kind, dest, sb]);

  const addPlace = (p: PlaceRow) => {
    onAdd({ kind, title: p.name, place_id: p.id, lat: p.lat, lng: p.lng, category: p.category, interest_category: p.interest_category, opening_hours: p.opening_hours, outdoor: !!p.tags?.outdoor, verified: true, duration_min: kind === "refeicao" ? 75 : 90 });
    setQ(""); setOpen(false);
  };
  const addFree = () => {
    if (!q.trim()) return;
    onAdd({ kind, title: q.trim(), duration_min: kind === "nota" ? 15 : kind === "livre" ? 60 : 60, verified: kind === "nota" || kind === "livre" });
    setQ(""); setOpen(false);
  };

  if (!open) return <button className="btn-secondary w-full" onClick={() => setOpen(true)}><Plus size={16} /> Adicionar lugar, nota ou trajeto</button>;
  return (
    <div className="card space-y-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {([["lugar", "Lugar"], ["refeicao", "Refeição"], ["hospedagem", "Hospedagem"], ["trajeto", "Trajeto"], ["nota", "Nota"], ["livre", "Tempo livre"]] as const).map(([k, l]) => (
          <button key={k} className={`chip min-h-8 ${kind === k ? "border-blue bg-blue text-white" : ""}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
          <input className="input pl-8" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFree()}
            placeholder={["lugar", "refeicao", "hospedagem"].includes(kind) ? `Buscar em ${dest?.city ?? "lugares"} ou digitar o nome` : "Descreva"} />
        </div>
        <button className="btn-primary" onClick={addFree}>Adicionar</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {results.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {results.map((r) => (
            <li key={r.id}><button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => addPlace(r)}>
              <span className="flex-1 font-medium">{r.name}</span><span className="text-xs text-gray">{r.category}</span>
            </button></li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray">Lugares da base própria (OpenStreetMap) entram como verificados; nomes digitados ficam marcados como não verificados.</p>
    </div>
  );
}
