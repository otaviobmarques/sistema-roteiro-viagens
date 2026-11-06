"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Download, LogOut, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { INTEREST_CATEGORIES, TRAVEL_PROFILES, WEIGHT_LABELS } from "@/lib/domain/score";
import { pixKeyKind } from "@/lib/domain/pix";
import { Notice } from "@/components/ui";
import { ChangePassword } from "./change-password";
import type { Profile } from "@/lib/types";

type Restrictions = { criancas?: boolean; mobilidade?: boolean; alimentacao?: string[]; outros?: string };
const FOOD = ["vegetariano", "vegano", "sem glúten", "sem lactose"];
const PIX_KIND: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", email: "e-mail", telefone: "telefone", aleatoria: "chave aleatória" };

export function ProfileForm({ userId, email, profile, interests: initialInterests }: { userId: string; email: string; profile: Profile; interests: Record<string, number> }) {
  const router = useRouter();
  const [name, setName] = useState(profile?.name ?? "");
  const [homeCity, setHomeCity] = useState(profile?.home_city ?? "");
  const [pix, setPix] = useState(profile?.pix_key ?? "");
  const [travelProfile, setTravelProfile] = useState(profile?.travel_profile ?? "classica");
  const [pace, setPace] = useState(profile?.pace ?? "equilibrado");
  const [restr, setRestr] = useState<Restrictions>((profile?.restrictions as Restrictions) ?? {});
  const [interests, setInterests] = useState<Record<string, number>>(initialInterests);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const pixKind = pix.trim() ? pixKeyKind(pix) : null;

  const cycle = (id: string) => setInterests((s) => {
    const cur = s[id] ?? 0;
    const next = cur >= 3 ? 0 : cur + 1;
    const copy = { ...s };
    if (next === 0) delete copy[id]; else copy[id] = next;
    return copy;
  });

  const toggleFood = (f: string) => setRestr((r) => {
    const list = new Set(r.alimentacao ?? []);
    if (list.has(f)) list.delete(f); else list.add(f);
    return { ...r, alimentacao: [...list] };
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (pix.trim() && !pixKind) {
      setMsg({ tone: "danger", text: "Chave Pix inválida. Use CPF (11 dígitos), CNPJ (14), e-mail, telefone com +55 ou chave aleatória." });
      return;
    }
    setSaving(true);
    const sb = supabaseBrowser();
    const { error } = await sb.from("profiles").update({
      name: name.trim() || null, home_city: homeCity.trim() || null, pix_key: pix.trim() || null,
      travel_profile: travelProfile, pace, restrictions: restr,
    }).eq("id", userId);
    if (!error) {
      await sb.from("user_interests").delete().eq("user_id", userId);
      const rows = Object.entries(interests).map(([category, weight]) => ({ user_id: userId, category, weight }));
      if (rows.length) await sb.from("user_interests").insert(rows);
    }
    setSaving(false);
    setMsg(error ? { tone: "danger", text: "Não deu para salvar: " + error.message } : { tone: "ok", text: "Perfil salvo. O Pino vai usar isso nos próximos roteiros." });
    router.refresh();
  };

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/entrar");
    router.refresh();
  };

  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Seus dados</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Nome
              <input className="input mt-1 font-normal" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="block text-sm font-semibold">E-mail
              <input className="input mt-1 font-normal" value={email} disabled />
            </label>
            <label className="block text-sm font-semibold">Cidade de origem
              <input className="input mt-1 font-normal" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="São Paulo" />
            </label>
            <label className="block text-sm font-semibold">Chave Pix <span className="font-normal text-gray">(para receber acertos do grupo)</span>
              <input className="input mono mt-1 font-normal" value={pix} onChange={(e) => setPix(e.target.value)} placeholder="CPF, e-mail, +55 telefone ou aleatória" />
              {pix.trim() && <span className={clsx("mt-1 block text-xs font-normal", pixKind ? "text-ok" : "text-danger")}>{pixKind ? `Chave do tipo ${PIX_KIND[pixKind]}` : "Formato não reconhecido"}</span>}
            </label>
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Como você viaja</h2>
          <div>
            <div className="label mb-1.5">Estilo de gasto</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(TRAVEL_PROFILES) as (keyof typeof TRAVEL_PROFILES)[]).map((k) => (
                <button type="button" key={k} onClick={() => setTravelProfile(k)} aria-pressed={travelProfile === k}
                  className={clsx("rounded-xl border p-3 text-left text-sm", travelProfile === k ? "border-blue bg-blue-50 ring-4 ring-blue/10" : "border-line bg-white")}>
                  <div className="font-semibold">{TRAVEL_PROFILES[k].label}</div>
                  <div className="text-xs text-gray">{TRAVEL_PROFILES[k].idea}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">Ritmo</div>
            <div className="inline-flex rounded-xl border border-line bg-ice p-1">
              {(["leve", "equilibrado", "intenso"] as const).map((p) => (
                <button type="button" key={p} onClick={() => setPace(p)} aria-pressed={pace === p}
                  className={clsx("min-h-9 rounded-lg px-3 text-sm font-semibold capitalize", pace === p ? "bg-white text-navy shadow-sm" : "text-gray")}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">Interesses <span className="normal-case tracking-normal">(toque para mudar: Gosto → Curto muito → Amo → nada)</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INTEREST_CATEGORIES.map((c) => {
                const w = interests[c.id] ?? 0;
                return (
                  <button type="button" key={c.id} onClick={() => cycle(c.id)} aria-pressed={w > 0}
                    className={clsx("rounded-xl border px-3 py-2 text-left text-sm", w ? "border-blue/40 bg-blue-50" : "border-line bg-white")}>
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-xs text-gray">{w ? WEIGHT_LABELS[w] : "Tocar para escolher"}</div>
                    <div className="mt-1.5 flex gap-1">{[1, 2, 3].map((n) => <span key={n} className={clsx("h-1 flex-1 rounded-full", n <= w ? "bg-blue" : "bg-line")} />)}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">Restrições <span className="normal-case tracking-normal">(viram filtro, não peso)</span></div>
            <div className="flex flex-wrap gap-2">
              <label className="chip cursor-pointer"><input type="checkbox" checked={!!restr.criancas} onChange={(e) => setRestr({ ...restr, criancas: e.target.checked })} /> Viajo com crianças</label>
              <label className="chip cursor-pointer"><input type="checkbox" checked={!!restr.mobilidade} onChange={(e) => setRestr({ ...restr, mobilidade: e.target.checked })} /> Mobilidade reduzida</label>
              {FOOD.map((f) => (
                <label key={f} className="chip cursor-pointer capitalize"><input type="checkbox" checked={(restr.alimentacao ?? []).includes(f)} onChange={() => toggleFood(f)} /> {f}</label>
              ))}
            </div>
            <input className="input mt-2" placeholder="Outras restrições (ex.: alergia a frutos do mar)" value={restr.outros ?? ""} onChange={(e) => setRestr({ ...restr, outros: e.target.value })} />
          </div>
        </section>

        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <button className="btn-primary" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar perfil</button>
      </div>

      <div className="space-y-4">
        <section className="card space-y-3 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} /> Privacidade (LGPD)</h2>
          <p className="text-sm text-gray">Seus documentos pessoais nunca são enviados à IA. Você pode baixar tudo o que guardamos sobre você.</p>
          <a href="/api/me/export" className="btn-secondary w-full"><Download size={16} /> Exportar meus dados</a>
          <button type="button" className="btn-danger w-full" onClick={() => setShowDelete((v) => !v)}><Trash2 size={16} /> Excluir conta</button>
          {showDelete && (
            <Notice tone="warn">
              Para excluir sua conta e todos os dados, escreva para <b>privacidade@rotta365.app</b> a partir do e-mail {email}. Respondemos em até 15 dias, como prevê a LGPD.
              Antes, transfira a organização das viagens compartilhadas para outra pessoa do grupo. A exclusão pelo próprio app chega numa próxima versão.
            </Notice>
          )}
        </section>
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Segurança</h2>
          <ChangePassword />
          <p className="text-sm text-gray">Verificação em duas etapas, passkeys e lista de sessões ativas chegam na V1.</p>
          <button type="button" onClick={signOut} className="btn-secondary w-full"><LogOut size={16} /> Sair da conta</button>
        </section>
      </div>
    </form>
  );
}
