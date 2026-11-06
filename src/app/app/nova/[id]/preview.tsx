"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Unlock, Minus, Plus, Train, Plane, Bus, Loader2, Sparkles } from "lucide-react";
import { PinoAvatar, Notice, Pill } from "@/components/ui";
import { adjustDays, type Destination as MDest } from "@/lib/domain/multidest";
import { addDays, fmtDateShort, fmtDuration } from "@/lib/domain/time";
import { fmtBRL } from "@/lib/domain/settle";
import { INTEREST_CATEGORIES, TRAVEL_PROFILES, WEIGHT_LABELS } from "@/lib/domain/score";
import type { Destination, Trip } from "@/lib/types";

type AIPreview = {
  summary: string;
  division_reason: string;
  destinations: { city: string; highlights: string[]; why_days: string; est_daily_brl: number; est_nightly_brl: number }[];
} | null;

const sameCity = (a: string, b: string) => {
  const n = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\(.*\)/, "").split(",")[0].trim();
  return n(a) === n(b) || n(a).startsWith(n(b)) || n(b).startsWith(n(a));
};

const COLORS = ["#205BFF", "#2F6BFF", "#0A1F4C", "#0B7F84", "#11C2C8", "#3A4D7A", "#5B8CFF", "#7FDDE0"];
const STEPS = ["Buscando lugares reais na base aberta", "Filtrando por qualidade e pelo seu perfil", "Montando os dias com o Pino", "Conferindo horários, trajetos e clima", "Calculando os três perfis de preço"];

export function PreviewClient(props: {
  trip: Trip; destinations: Destination[]; legs: { from: string; to: string; km: number; mode: string; minutes: number }[];
  profile: string; interests: Record<string, number>; mustHaves: string[]; credits: number; ai: AIPreview; isOwner: boolean;
}) {
  const router = useRouter();
  const { trip } = props;
  const [ai, setAi] = useState<AIPreview>(props.ai);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dests, setDests] = useState(props.destinations);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const total = dests.reduce((s, d) => s + (d.days ?? 0), 0);

  useEffect(() => {
    const cached = sessionStorage.getItem(`preview:${trip.id}`);
    if (cached) {
      const d = JSON.parse(cached);
      if (d.ai) setAi(d.ai);
      if (d.aiError) setAiError(d.aiError);
    }
  }, [trip.id]);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 9000);
    return () => clearInterval(t);
  }, [generating]);

  const persist = async (next: Destination[]) => {
    setSaving(true);
    const r = await fetch(`/api/trips/${trip.id}/destinations`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinations: next.map((d) => ({ id: d.id, days: d.days ?? 1, locked: d.locked })) }) });
    setSaving(false);
    if (!r.ok) setErr((await r.json()).error);
  };

  const change = (id: string, delta: number) => {
    const asM: MDest[] = dests.map((d) => ({ id: d.id, city: d.city, lat: d.lat ?? 0, lng: d.lng ?? 0, days: d.days ?? 1, locked: d.locked }));
    const out = adjustDays(asM, id, delta, total);
    if (out === asM) return;
    const next = dests.map((d) => ({ ...d, days: out.find((o) => o.id === d.id)!.days ?? d.days }));
    setDests(next);
    persist(next);
  };
  const toggleLock = (id: string) => {
    const next = dests.map((d) => (d.id === id ? { ...d, locked: !d.locked } : d));
    setDests(next);
    persist(next);
  };

  const dated = useMemo(() => {
    let cursor = trip.start_date!;
    return dests.map((d) => { const s = cursor; cursor = addDays(cursor, d.days ?? 1); return { ...d, s, e: addDays(s, (d.days ?? 1) - 1) }; });
  }, [dests, trip.start_date]);

  const estimate = useMemo(() => {
    if (!ai) return null;
    const people = trip.travelers_adults + trip.travelers_children;
    const rooms = Math.max(1, Math.ceil(trip.travelers_adults / 2));
    return dests.reduce((sum, d) => {
      const a = ai.destinations.find((x) => sameCity(x.city, d.city));
      return a ? sum + (a.est_daily_brl * people + a.est_nightly_brl * rooms) * (d.days ?? 1) * 100 : sum;
    }, 0);
  }, [ai, dests, trip]);

  const generate = async () => {
    setGenerating(true);
    setStep(0);
    setErr(null);
    const r = await fetch(`/api/trips/${trip.id}/generate`, { method: "POST" });
    const d = await r.json().catch(() => ({ error: "Erro inesperado" }));
    if (r.status === 402) { router.push(`/app/carteira?trip=${trip.id}`); return; }
    if (!r.ok) { setErr(d.error); setGenerating(false); return; }
    sessionStorage.setItem(`generated:${trip.id}`, JSON.stringify(d));
    router.push(`/app/viagem/${trip.id}?gerado=1`);
    router.refresh();
  };

  if (generating) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-12 text-center">
        <PinoAvatar mood="partiu" size={84} className="animate-bounce" />
        <h1 className="text-2xl font-extrabold">Montando seu roteiro…</h1>
        <ul className="w-full space-y-2 text-left">
          {STEPS.map((s, i) => (
            <li key={s} className={`card flex items-center gap-3 px-4 py-3 text-sm ${i > step ? "opacity-40" : ""}`}>
              {i < step ? <span className="text-ok">✓</span> : i === step ? <Loader2 size={16} className="animate-spin text-blue" /> : <span className="h-4 w-4" />}
              {s}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray">Leva cerca de 1 minuto. O crédito só é debitado se der tudo certo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PinoAvatar mood="achei" size={48} />
        <div className="flex-1">
          <div className="label">Prévia grátis · multidestino</div>
          <h1 className="text-2xl font-extrabold md:text-3xl">{trip.title}</h1>
        </div>
        <ol className="hidden gap-1 text-xs font-semibold md:flex">
          {["1 · Destinos", "2 · Estilo", "3 · Divisão dos dias", "4 · Roteiro completo"].map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${i === 2 ? "bg-navy text-white" : "bg-white text-gray"}`}>{s}</li>)}
        </ol>
      </div>

      <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-xs">
        <span className="label">Destinos</span>{dests.map((d) => <span key={d.id} className="rounded-full bg-blue px-2.5 py-1 font-semibold text-white">{d.city}</span>)}
        <span className="label">Datas</span><span className="mono font-semibold">{fmtDateShort(trip.start_date)} → {fmtDateShort(dated.at(-1)?.e)}</span>
        <span className="label">Viajantes</span><span className="font-semibold">{trip.travelers_adults} adulto(s){trip.travelers_children ? ` + ${trip.travelers_children} criança(s)` : ""}</span>
        <span className="label">Perfil</span><span className="font-semibold">{TRAVEL_PROFILES[props.profile as keyof typeof TRAVEL_PROFILES]?.label}</span>
        <span className="label">Amam</span><span className="font-semibold">{Object.entries(props.interests).filter(([, w]) => w === 3).map(([k]) => INTEREST_CATEGORIES.find((c) => c.id === k)?.label.split(" ")[0].toLowerCase()).join(", ") || "—"}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="hero-gradient flex flex-wrap items-center gap-4 rounded-2xl p-4 text-white">
            <div className="flex-1">
              <div className="font-bold">O Pino organizou a ordem e os dias</div>
              <div className="text-sm text-white/85">{ai?.division_reason || "Ordem que evita ida e volta; dias pelo que cada lugar tem para ver e pelos seus interesses."}</div>
            </div>
            {estimate != null && <div className="rounded-xl bg-white/15 px-4 py-2 text-center"><div className="mono text-xl font-semibold">{fmtBRL(estimate, { compact: true })}</div><div className="text-[10px] font-semibold uppercase tracking-wider">estimado total</div></div>}
            <div className="rounded-xl bg-white/15 px-4 py-2 text-center"><div className="mono text-xl font-semibold">{props.legs.length}</div><div className="text-[10px] font-semibold uppercase tracking-wider">trechos</div></div>
          </div>

          <div className="card p-4">
            <div className="label mb-2">Divisão dos {total} dias {saving && <span className="normal-case text-gray">· salvando…</span>}</div>
            <div className="flex overflow-hidden rounded-lg text-[11px] font-semibold text-white">
              {dests.map((d, i) => <div key={d.id} className="truncate px-2 py-2 text-center" style={{ flex: d.days ?? 1, background: COLORS[i % COLORS.length] }}>{d.city.slice(0, 10)} {d.days}</div>)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {dated.map((d, i) => {
              const a = ai?.destinations.find((x) => sameCity(x.city, d.city));
              return (
                <div key={d.id} className={`card p-4 ${d.locked ? "ring-1 ring-teal" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="mono text-[11px] text-gray">{String(i + 1).padStart(2, "0")} · {fmtDateShort(d.s)}–{fmtDateShort(d.e)}</div>
                      <div className="text-lg font-bold">{d.city} {d.locked && <Pill tone="teal">travado</Pill>}</div>
                      {d.country && <div className="text-xs text-gray">{d.country}</div>}
                    </div>
                    {props.isOwner && (
                      <div className="flex items-center gap-1">
                        <button className="btn-secondary btn-sm w-9 px-0" onClick={() => change(d.id, -1)} disabled={(d.days ?? 1) <= 1 || d.locked} aria-label={`Menos um dia em ${d.city}`}><Minus size={14} /></button>
                        <span className="mono w-7 text-center text-lg font-semibold">{d.days}</span>
                        <button className="btn-secondary btn-sm w-9 px-0" onClick={() => change(d.id, 1)} disabled={d.locked || dests.length < 2} aria-label={`Mais um dia em ${d.city}`}><Plus size={14} /></button>
                        <button className="btn-ghost btn-sm w-9 px-0" onClick={() => toggleLock(d.id)} aria-label={d.locked ? "Destravar destino" : "Travar destino"} title={d.locked ? "Destravar" : "Travar dias deste destino"}>{d.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                      </div>
                    )}
                  </div>
                  {a ? (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1.5">{a.highlights.map((h) => <span key={h} className="chip">{h}</span>)}</div>
                      <p className="mt-2 text-xs text-gray">{a.why_days}</p>
                    </>
                  ) : <p className="mt-2 text-xs text-gray">Destaques aparecem quando a IA estiver configurada.</p>}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="space-y-3">
          {props.legs.length > 0 && (
            <div className="card p-4">
              <div className="label mb-2">Trechos entre destinos</div>
              <ul className="space-y-2">
                {props.legs.map((l) => {
                  const from = dests.find((d) => d.id === l.from)?.city; const to = dests.find((d) => d.id === l.to)?.city;
                  const Icon = l.mode === "aviao" ? Plane : l.mode === "trem" ? Train : Bus;
                  return (
                    <li key={l.from + l.to} className="flex items-center gap-2 text-sm">
                      <Icon size={14} className="text-blue" /><span className="flex-1 font-semibold">{from} → {to}</span>
                      <span className="mono text-xs text-gray">{l.mode === "aviao" ? "voo" : l.mode} {fmtDuration(l.minutes)} · {l.km} km</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {props.mustHaves.length > 0 && (
            <div className="card p-4">
              <div className="label mb-2 flex items-center gap-1"><Lock size={12} /> Não abro mão</div>
              <div className="flex flex-wrap gap-1.5">{props.mustHaves.map((m) => <span key={m} className="chip border-teal/40 bg-teal-50">{m}</span>)}</div>
            </div>
          )}
          {ai?.summary && <div className="pino-border flex gap-2 rounded-2xl p-4 text-sm"><PinoAvatar size={28} /><p>{ai.summary}</p></div>}
          {aiError && <Notice>{aiError}</Notice>}
          {err && <Notice tone="danger">{err}</Notice>}
          {props.isOwner ? (
            <>
              <button className="btn-primary w-full" onClick={generate}><Sparkles size={16} /> {trip.generated ? "Refazer roteiro (ajuste incluso)" : "Gerar roteiro completo · 1 crédito"}</button>
              <p className="text-center text-xs text-gray">Você tem <b className="mono">{props.credits}</b> crédito(s). {props.credits < 1 && !trip.generated && <Link href={`/app/carteira?trip=${trip.id}`} className="font-semibold text-blue">Comprar</Link>}</p>
              <p className="text-xs text-gray">Inclui: lugares verificados, horários em cascata, score de viabilidade, três perfis com preço, opções por item e PDF. Ajustes da mesma viagem não consomem crédito novo.</p>
            </>
          ) : <Notice tone="blue">Só o organizador pode gerar o roteiro completo.</Notice>}
          <Link href={`/app/viagem/${trip.id}`} className="btn-secondary w-full">Planejar à mão (grátis)</Link>
          <div className="text-[11px] text-gray">Pesos: {Object.entries(props.interests).map(([k, w]) => `${INTEREST_CATEGORIES.find((c) => c.id === k)?.label} (${WEIGHT_LABELS[w]})`).join(" · ")}</div>
        </aside>
      </div>
    </div>
  );
}
