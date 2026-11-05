"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { PinoAvatar, Notice, Pill } from "@/components/ui";
import { fmtBRL } from "@/lib/domain/settle";
import { TRAVEL_PROFILES } from "@/lib/domain/score";

type Card = { title: string; cities: string[]; country: string; days: number; price_per_person_brl: number; reason: string; best_season: string; touch: string };
type Cards = { mode: "surpreenda"; intro: string; cards: Card[] };
type Decide = { mode: "decidir"; answer: string; options: { label: string; pros: string[]; cons: string[] }[]; suggestion: { cities: string[]; days: number; when: string } | null; caveat: string };

const OCCASIONS = [
  { id: "aniversario_casamento", label: "Aniversário de casamento" },
  { id: "lua_de_mel", label: "Lua de mel" },
  { id: "ferias_filhos", label: "Férias com filhos" },
  { id: "sozinho", label: "Viagem sozinho" },
  { id: "despedida", label: "Despedida" },
  { id: "outra", label: "Outra" },
];
const GRADIENTS = ["from-[#205BFF] to-[#11C2C8]", "from-[#0A1F4C] to-[#205BFF]", "from-[#11C2C8] to-[#0A1F4C]", "from-[#3B7BFF] to-[#7B61FF]"];

function buildLink(cities: string[], days: number, occasion?: string) {
  const p = new URLSearchParams({ destinos: cities.join(","), dias: String(days) });
  if (occasion) p.set("ocasiao", occasion);
  return `/app/nova?${p.toString()}`;
}

export function Discover({ initialTab, previewsLeft, defaultProfile, origin }: { initialTab: "surpreenda" | "decidir"; previewsLeft: number; defaultProfile: string; origin: string }) {
  const [tab, setTab] = useState(initialTab);
  const [left, setLeft] = useState(previewsLeft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState({ occasion: "aniversario_casamento", budget: "5000", days: "5", landscape: "tanto_faz", scope: "tanto_faz", profile: defaultProfile, origin });
  const [cards, setCards] = useState<Cards | null>(null);
  const [question, setQuestion] = useState("");
  const [decide, setDecide] = useState<Decide | null>(null);

  const call = async (payload: Record<string, unknown>) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro");
      if (typeof data.previewsLeft === "number") setLeft(data.previewsLeft);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const surprise = async (adjust?: string, more = false) => {
    const data = await call({ mode: "surpreenda", answers, adjust, exclude: more && cards ? cards.cards.map((c) => c.title) : [] });
    if (data) setCards(data);
  };
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await call({ mode: "decidir", question });
    if (data) setDecide(data);
  };

  const set = (k: keyof typeof answers, v: string) => setAnswers((a) => ({ ...a, [k]: v }));
  const Seg = ({ k, opts }: { k: keyof typeof answers; opts: [string, string][] }) => (
    <div className="inline-flex flex-wrap rounded-xl border border-line bg-ice p-1">
      {opts.map(([v, l]) => (
        <button type="button" key={v} onClick={() => set(k, v)} aria-pressed={answers[k] === v} className={clsx("min-h-9 rounded-lg px-3 text-sm font-semibold", answers[k] === v ? "bg-white text-navy shadow-sm" : "text-gray")}>{l}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-line bg-white p-1" role="tablist">
          <button role="tab" aria-selected={tab === "surpreenda"} onClick={() => setTab("surpreenda")} className={clsx("min-h-10 rounded-lg px-4 text-sm font-semibold", tab === "surpreenda" ? "bg-blue text-white" : "text-gray")}>Me surpreenda</button>
          <button role="tab" aria-selected={tab === "decidir"} onClick={() => setTab("decidir")} className={clsx("min-h-10 rounded-lg px-4 text-sm font-semibold", tab === "decidir" ? "bg-blue text-white" : "text-gray")}>Me ajuda a decidir</button>
        </div>
        <span className="text-xs text-gray"><span className="mono">{left}</span> prévia{left === 1 ? "" : "s"} grátis hoje</span>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}

      {tab === "surpreenda" ? (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); surprise(); }}>
            <div className="flex items-center gap-2"><PinoAvatar size={36} /><p className="text-sm font-semibold">Me conta a ocasião e eu acho 3 ou 4 destinos que combinam.</p></div>
            <div>
              <div className="label mb-1.5">Ocasião</div>
              <div className="flex flex-wrap gap-1.5">
                {OCCASIONS.map((o) => <button type="button" key={o.id} onClick={() => set("occasion", o.id)} aria-pressed={answers.occasion === o.id} className={clsx("chip min-h-9", answers.occasion === o.id && "border-blue bg-blue-50 text-blue")}>{o.label}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">Orçamento por pessoa (R$)<input inputMode="numeric" className="input mono mt-1 font-normal" value={answers.budget} onChange={(e) => set("budget", e.target.value.replace(/\D/g, ""))} /></label>
              <label className="block text-sm font-semibold">Dias<input inputMode="numeric" className="input mono mt-1 font-normal" value={answers.days} onChange={(e) => set("days", e.target.value.replace(/\D/g, ""))} /></label>
            </div>
            <div><div className="label mb-1.5">Paisagem</div><Seg k="landscape" opts={[["praia", "Praia"], ["montanha", "Montanha"], ["tanto_faz", "Tanto faz"]]} /></div>
            <div><div className="label mb-1.5">Alcance</div><Seg k="scope" opts={[["nacional", "Nacional"], ["internacional", "Internacional"], ["tanto_faz", "Tanto faz"]]} /></div>
            <div><div className="label mb-1.5">Perfil</div><Seg k="profile" opts={Object.entries(TRAVEL_PROFILES).map(([k, v]) => [k, v.label])} /></div>
            <button className="btn-primary w-full" disabled={loading || left <= 0}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Me surpreenda</button>
          </form>

          <div className="space-y-3">
            {!cards && !loading && (
              <div className="card flex flex-col items-center gap-3 p-10 text-center">
                <PinoAvatar mood="achei" size={64} />
                <p className="max-w-sm text-sm text-gray">Suas sugestões aparecem aqui, com preço estimado e o motivo de combinarem com você. A prévia é grátis.</p>
              </div>
            )}
            {loading && <div className="card flex items-center gap-3 p-6"><PinoAvatar size={40} /><span className="text-sm">O Pino está pensando nos destinos…</span><Loader2 className="animate-spin" size={18} /></div>}
            {cards && !loading && (
              <>
                <div className="flex items-center gap-2"><PinoAvatar mood="achei" size={36} /><p className="text-sm font-semibold">{cards.intro}</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cards.cards.map((c, i) => (
                    <article key={c.title + i} className="card overflow-hidden">
                      <div className={clsx("bg-gradient-to-br p-4 text-white", GRADIENTS[i % GRADIENTS.length])}>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">{c.country} · {c.days} dias</div>
                        <h3 className="text-lg font-bold">{c.title}</h3>
                        <div className="text-sm text-white/90">{c.cities.join(" › ")}</div>
                      </div>
                      <div className="space-y-2 p-4 text-sm">
                        <div className="flex items-baseline justify-between"><span className="label">Estimado por pessoa</span><span className="mono font-semibold">{fmtBRL(Math.round(c.price_per_person_brl * 100))}</span></div>
                        <p>{c.reason}</p>
                        <div className="flex flex-wrap gap-1.5"><Pill tone="teal">{c.best_season}</Pill><Pill tone="blue">{c.touch}</Pill></div>
                        <Link href={buildLink(c.cities, c.days, answers.occasion)} className="btn-primary btn-sm w-full"><Wand2 size={14} /> Montar este roteiro</Link>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary btn-sm" disabled={loading || left <= 0} onClick={() => surprise(undefined, true)}><RefreshCw size={14} /> Não gostei, outras opções</button>
                  {["mais barato", "com praia", "nacional"].map((a) => <button key={a} className="chip min-h-9" disabled={loading || left <= 0} onClick={() => surprise(a, true)}>{a}</button>)}
                </div>
                <p className="text-xs text-gray">Preços são estimativas da IA, sem passagens internacionais. O roteiro completo confere lugares e custos.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form className="card space-y-3 p-5" onSubmit={ask}>
            <div className="flex items-center gap-2"><PinoAvatar size={36} /><p className="text-sm font-semibold">Pergunte qualquer coisa sobre quando ou para onde ir.</p></div>
            <textarea className="input min-h-28 py-2" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Qual a melhor época para ver neve na Argentina?" aria-label="Sua dúvida" />
            <div className="flex flex-wrap gap-1.5">
              {["Melhor época para ver neve na Argentina?", "Nordeste em julho: qual praia chove menos?", "Lisboa ou Barcelona para 5 dias com crianças?"].map((s) => <button type="button" key={s} className="chip text-left" onClick={() => setQuestion(s)}>{s}</button>)}
            </div>
            <button className="btn-primary w-full" disabled={loading || left <= 0 || question.trim().length < 5}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Perguntar ao Pino</button>
          </form>
          <div className="space-y-3">
            {!decide && !loading && <div className="card p-10 text-center text-sm text-gray">A resposta aparece aqui, com prós e contras de cada opção.</div>}
            {loading && <div className="card flex items-center gap-3 p-6"><PinoAvatar size={40} /><span className="text-sm">Pensando…</span><Loader2 className="animate-spin" size={18} /></div>}
            {decide && !loading && (
              <>
                <div className="card pino-border flex gap-3 p-4"><PinoAvatar mood="achei" size={40} /><p className="text-sm">{decide.answer}</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {decide.options.map((o) => (
                    <div key={o.label} className="card p-4 text-sm">
                      <h3 className="mb-2 font-bold">{o.label}</h3>
                      <ul className="space-y-1">{o.pros.map((p) => <li key={p} className="text-ok">+ {p}</li>)}{o.cons.map((c) => <li key={c} className="text-danger">− {c}</li>)}</ul>
                    </div>
                  ))}
                </div>
                {decide.suggestion && (
                  <div className="card flex flex-wrap items-center gap-3 p-4">
                    <PinoAvatar mood="partiu" size={36} />
                    <div className="min-w-0 flex-1 text-sm"><b>Quer que eu monte o roteiro?</b> {decide.suggestion.cities.join(" › ")} · {decide.suggestion.days} dias · {decide.suggestion.when}</div>
                    <Link className="btn-primary btn-sm" href={buildLink(decide.suggestion.cities, decide.suggestion.days)}>Montar roteiro</Link>
                  </div>
                )}
                <p className="text-xs text-gray">{decide.caveat}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
