"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Lock, Loader2 } from "lucide-react";
import { PinoAvatar, Notice } from "@/components/ui";
import { InterestPicker, Segmented } from "@/components/interest-picker";
import { TRAVEL_PROFILES } from "@/lib/domain/score";
import { addDays } from "@/lib/domain/time";
import { parseMoneyToCents } from "@/lib/domain/settle";

type Defaults = { origin: string; profile: "mochilao" | "classica" | "experiencia"; pace: "leve" | "equilibrado" | "intenso"; interests: Record<string, number> };

const OCCASIONS = ["Férias", "Lua de mel", "Aniversário de casamento", "Férias com filhos", "Viagem sozinho", "Despedida", "Trabalho + lazer"];

export function NewTripForm({ q, prefill, defaults }: { q: string | null; prefill: { destinations: string[]; days: number | null; occasion: string | null }; defaults: Defaults }) {
  const router = useRouter();
  const in30 = addDays(new Date().toISOString().slice(0, 10), 30);
  const [dests, setDests] = useState<string[]>(prefill.destinations);
  const [destInput, setDestInput] = useState("");
  const [start, setStart] = useState(in30);
  const [end, setEnd] = useState(addDays(in30, (prefill.days ?? 7) - 1));
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [ages, setAges] = useState("");
  const [profile, setProfile] = useState(defaults.profile);
  const [pace, setPace] = useState(defaults.pace);
  const [interests, setInterests] = useState<Record<string, number>>(Object.keys(defaults.interests).length ? defaults.interests : { cultura: 2, gastronomia: 2 });
  const [must, setMust] = useState<string[]>([]);
  const [mustInput, setMustInput] = useState("");
  const [occasion, setOccasion] = useState(prefill.occasion ?? "");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState(q ?? "");
  const [needs, setNeeds] = useState<{ alergia: string; mobilidade: boolean; pet: boolean; gestante: boolean; esportes: boolean; alergiaOn: boolean }>({ alergia: "", mobilidade: false, pet: false, gestante: false, esportes: false, alergiaOn: false });
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Texto livre vindo da barra do Pino: a IA preenche os campos para a pessoa revisar
  useEffect(() => {
    if (!q) return;
    setParsing(true);
    fetch("/api/trips/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.destinations?.length) setDests(d.destinations);
        const s = d.start_date && d.start_date > new Date().toISOString().slice(0, 10) ? d.start_date : in30;
        setStart(s);
        if (d.total_days) setEnd(addDays(s, d.total_days - 1));
        if (d.adults) setAdults(d.adults);
        if (d.children != null) setChildren(d.children);
        if (d.profile) setProfile(d.profile);
        if (d.interests?.length) setInterests(Object.fromEntries(d.interests.map((i: string) => [i, 3])));
        if (d.must_haves?.length) setMust(d.must_haves);
        if (d.occasion) setOccasion(d.occasion);
        if (d.notes) setNotes(d.notes);
      })
      .finally(() => setParsing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const addDest = () => {
    const v = destInput.trim();
    if (v && !dests.includes(v)) setDests([...dests, v]);
    setDestInput("");
  };
  const addMust = () => {
    const v = mustInput.trim();
    if (v && !must.includes(v)) setMust([...must, v]);
    setMustInput("");
  };
  const totalDays = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allDests = destInput.trim() ? [...dests, destInput.trim()] : dests;
    if (!allDests.length) { setErr("Adicione pelo menos um destino."); return; }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/trips/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinations: allDests, start_date: start, end_date: end, arrival: arrival || null, departure: departure || null, origin_city: defaults.origin || null,
        adults, children, children_ages: ages.split(/[,; ]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n < 18),
        profile, pace, interests, must_haves: mustInput.trim() ? [...must, mustInput.trim()] : must, occasion: occasion || null,
        special_needs: { alergia: needs.alergiaOn ? needs.alergia.trim() || null : null, mobilidade: needs.mobilidade, pet: needs.pet, gestante: needs.gestante, esportes: needs.esportes },
        budget_cap_cents: budget ? parseMoneyToCents(budget) : null, notes: notes || null,
      }),
    });
    const data = await res.json().catch(() => ({ error: "Erro inesperado" }));
    if (!res.ok) { setErr(data.error); setBusy(false); return; }
    sessionStorage.setItem(`preview:${data.tripId}`, JSON.stringify(data));
    router.push(`/app/nova/${data.tripId}`);
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <PinoAvatar size={48} />
        <div>
          <div className="label">Nova viagem · multidestino</div>
          <h1 className="text-2xl font-extrabold md:text-3xl">Me conta da viagem</h1>
        </div>
        {parsing && <span className="ml-auto inline-flex items-center gap-2 text-sm text-gray"><Loader2 className="animate-spin" size={16} /> Lendo seu pedido…</span>}
      </div>

      <section className="card space-y-4 p-5">
        <div>
          <div className="label mb-2">Destinos</div>
          <div className="flex flex-wrap items-center gap-2">
            {dests.map((d, i) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white">
                <span className="mono text-xs text-white/70">{i + 1}</span> {d}
                <button type="button" onClick={() => setDests(dests.filter((x) => x !== d))} aria-label={`Remover ${d}`}><X size={14} /></button>
              </span>
            ))}
            <div className="flex min-w-[220px] flex-1 gap-2">
              <input className="input" value={destInput} onChange={(e) => setDestInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDest(); } }} placeholder="+ país ou cidade (ex.: Lisboa)" aria-label="Adicionar destino" />
              <button type="button" className="btn-secondary w-11 px-0" onClick={addDest} aria-label="Adicionar destino"><Plus size={16} /></button>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-gray">Pode ser país ou cidade, quantos quiser. O Pino sugere a ordem que evita ida e volta.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block"><span className="label mb-1 block">Ida</span><input type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} required /></label>
          <label className="block"><span className="label mb-1 block">Volta</span><input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
          <label className="block"><span className="label mb-1 block">Chegada em (opcional)</span><input className="input" value={arrival} onChange={(e) => setArrival(e.target.value)} placeholder="Ex.: Lisboa" /></label>
          <label className="block"><span className="label mb-1 block">Saída por (opcional)</span><input className="input" value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="Ex.: Roma" /></label>
        </div>
        <div className="mono text-xs text-gray">{totalDays} dia(s) no total</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label mb-1 block">Adultos</span><input type="number" min={1} max={30} className="input" value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></label>
          <label className="block"><span className="label mb-1 block">Crianças</span><input type="number" min={0} max={20} className="input" value={children} onChange={(e) => setChildren(Number(e.target.value))} /></label>
          {children > 0 && <label className="block"><span className="label mb-1 block">Idades das crianças</span><input className="input" value={ages} onChange={(e) => setAges(e.target.value)} placeholder="Ex.: 4, 8" /></label>}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="label">Estilo de gasto</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(TRAVEL_PROFILES) as (keyof typeof TRAVEL_PROFILES)[]).map((k) => (
            <button key={k} type="button" onClick={() => setProfile(k)} aria-pressed={profile === k} className={`rounded-xl border p-3 text-left ${profile === k ? "border-blue bg-blue-50" : "border-line bg-white"}`}>
              <div className="font-bold">{TRAVEL_PROFILES[k].label}</div><div className="text-xs text-gray">{TRAVEL_PROFILES[k].idea}</div>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="label mb-1">Ritmo</div><Segmented label="Ritmo" value={pace} onChange={setPace} options={[{ value: "leve", label: "Leve" }, { value: "equilibrado", label: "Equilibrado" }, { value: "intenso", label: "Intenso" }]} /></div>
          <label className="block"><span className="label mb-1 block">Teto de orçamento (opcional)</span><input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="R$ 20.000" /></label>
        </div>
      </section>

      <section className="space-y-2">
        <div className="label">Do que vocês curtem</div>
        <InterestPicker value={interests} onChange={setInterests} compact />
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <div className="label mb-2 flex items-center gap-1"><Lock size={12} /> Não abro mão</div>
          <div className="flex flex-wrap gap-2">
            {must.map((m) => <span key={m} className="chip border-teal/40 bg-teal-50">{m}<button type="button" onClick={() => setMust(must.filter((x) => x !== m))} aria-label={`Remover ${m}`}><X size={12} /></button></span>)}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input" value={mustInput} onChange={(e) => setMustInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMust(); } }} placeholder="Ex.: Coliseu, pastel de Belém, pôr do sol em Santorini" />
            <button type="button" className="btn-secondary" onClick={addMust}>Adicionar</button>
          </div>
          <p className="mt-1 text-xs text-gray">Esses itens ficam travados: o Pino monta o resto em volta e nunca tira sem perguntar.</p>
        </div>
        <div>
          <div className="label mb-2">Ocasião</div>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => <button type="button" key={o} onClick={() => setOccasion(occasion === o ? "" : o)} className={`chip min-h-9 ${occasion === o ? "border-blue bg-blue text-white" : ""}`}>{o}</button>)}
          </div>
        </div>
        <div>
          <span className="label mb-2 block">Precisa de algo especial?</span>
          <div className="flex flex-wrap gap-2">
            {([["alergiaOn", "Alergia ou restrição alimentar"], ["mobilidade", "Mobilidade reduzida"], ["pet", "Viajando com pet"], ["gestante", "Gestante"], ["esportes", "Esportes radicais ou neve"]] as const).map(([k, l]) => (
              <button type="button" key={k} onClick={() => setNeeds({ ...needs, [k]: !needs[k] })} className={`chip min-h-9 ${needs[k] ? "border-blue bg-blue text-white" : ""}`}>{l}</button>
            ))}
          </div>
          {needs.alergiaOn && <input className="input mt-2" value={needs.alergia} onChange={(e) => setNeeds({ ...needs, alergia: e.target.value })} placeholder="Ex.: doença celíaca; alergia grave a amendoim e frutos do mar" aria-label="Qual alergia ou restrição" />}
          <span className="mt-1 block text-[11px] text-gray">O Pino ajusta o roteiro e monta um guia só para isso: cartão de alergia traduzido, dicas de acessibilidade, regras para pets e mais.</span>
        </div>
        <label className="block"><span className="label mb-1 block">Observações</span><textarea className="input min-h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Restrições, ritmo das crianças, dias livres, lugares já visitados…" /></label>
      </section>

      {err && <Notice tone="danger">{err}</Notice>}
      <div className="sticky bottom-3 z-10 flex justify-end">
        <button className="btn-primary shadow-[var(--shadow-pop)]" disabled={busy || parsing}>
          {busy ? <><Loader2 size={16} className="animate-spin" /> O Pino está organizando…</> : "Ver prévia grátis"}
        </button>
      </div>
    </form>
  );
}
