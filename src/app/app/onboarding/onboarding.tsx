"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PinoAvatar } from "@/components/ui";
import { InterestPicker, Segmented } from "@/components/interest-picker";
import { TRAVEL_PROFILES } from "@/lib/domain/score";

type State = { name: string; home_city: string; travel_profile: "mochilao" | "classica" | "experiencia"; pace: "leve" | "equilibrado" | "intenso"; interests: Record<string, number> };

export function Onboarding({ initial }: { initial: State }) {
  const [s, setS] = useState<State>(initial);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const save = async () => {
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const { error } = await sb.from("profiles").update({ name: s.name, home_city: s.home_city, travel_profile: s.travel_profile, pace: s.pace, onboarded: true }).eq("id", u.user.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    await sb.from("user_interests").delete().eq("user_id", u.user.id);
    const rows = Object.entries(s.interests).map(([category, weight]) => ({ user_id: u.user!.id, category, weight }));
    if (rows.length) await sb.from("user_interests").insert(rows);
    router.replace("/app");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="mono text-xs font-semibold">PASSO {step}/3</span>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gradient-to-r from-blue to-teal transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
        <button onClick={save} className="ml-auto text-sm font-semibold text-blue">Pular por agora</button>
      </div>
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div>
          <PinoAvatar size={64} />
          <h1 className="mt-4 text-3xl font-extrabold leading-tight">
            {step === 1 && <>Oi! Como posso <span className="text-blue">te chamar?</span></>}
            {step === 2 && <>Qual é o seu <span className="text-blue">jeito de viajar?</span></>}
            {step === 3 && <>Do que você <span className="text-blue">curte</span> numa viagem?</>}
          </h1>
          <p className="mt-2 text-sm text-gray">
            {step === 1 && "Com isso eu personalizo as sugestões e calculo trechos a partir da sua cidade."}
            {step === 2 && "O perfil muda hospedagem, restaurantes, passeios e transporte juntos. Dá para trocar em cada viagem."}
            {step === 3 && "Escolha quantas quiser e diga o quanto gosta de cada uma. Eu uso isso para dividir o tempo de cada dia do roteiro."}
          </p>
        </div>
        <div className="space-y-4">
          {step === 1 && (
            <div className="card space-y-4 p-5">
              <label className="block"><span className="mb-1 block text-sm font-semibold">Seu nome</span><input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} autoFocus /></label>
              <label className="block"><span className="mb-1 block text-sm font-semibold">Cidade de origem</span><input className="input" value={s.home_city} onChange={(e) => setS({ ...s, home_city: e.target.value })} placeholder="Ex.: São Paulo" /></label>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(TRAVEL_PROFILES) as (keyof typeof TRAVEL_PROFILES)[]).map((k) => (
                  <button key={k} type="button" onClick={() => setS({ ...s, travel_profile: k, pace: TRAVEL_PROFILES[k].pace as State["pace"] })}
                    className={`card p-4 text-left ${s.travel_profile === k ? "ring-2 ring-blue" : ""}`} aria-pressed={s.travel_profile === k}>
                    <div className="label">{k === "mochilao" ? "$" : k === "classica" ? "$$" : "$$$"}</div>
                    <div className="mt-1 text-lg font-bold">{TRAVEL_PROFILES[k].label}</div>
                    <div className="text-sm text-gray">{TRAVEL_PROFILES[k].idea}</div>
                  </button>
                ))}
              </div>
              <div className="card p-4">
                <div className="label mb-2">Ritmo</div>
                <Segmented label="Ritmo" value={s.pace} onChange={(v) => setS({ ...s, pace: v })} options={[{ value: "leve", label: "Leve" }, { value: "equilibrado", label: "Equilibrado" }, { value: "intenso", label: "Intenso" }]} />
              </div>
            </div>
          )}
          {step === 3 && <InterestPicker value={s.interests} onChange={(interests) => setS({ ...s, interests })} />}
          {err && <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">{err}</p>}
          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>Voltar</button>
            {step < 3 ? <button className="btn-primary" onClick={() => setStep(step + 1)}>Continuar</button> : <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Começar a planejar"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
