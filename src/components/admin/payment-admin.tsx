"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { KeyRound, ShieldCheck, FlaskConical, Rocket, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Pill, Notice } from "@/components/ui";
import { CopyField } from "./gateway-editor";
import { FIELDS, readiness } from "@/lib/payments/fields";

type Env = "sandbox" | "producao";
type Cred = { provider: string; environment: Env; kind: string; last4: string; updated_at: string };

/** Chave seletora Teste/Produção (RF-185). Vale na hora para novas cobranças, sem novo deploy. */
export function ModeSwitch({ env, creds, activeProviders }: { env: Env; creds: Cred[]; activeProviders: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const prodReady = activeProviders.length > 0 && activeProviders.every((p) => readiness(creds, p, "producao"));

  const apply = async (next: Env) => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().rpc("admin_set_payment_env", { p_env: next });
    setBusy(false);
    setConfirming(false);
    setTyped("");
    if (error) setMsg({ tone: "danger", text: error.message });
    else { setMsg({ tone: "ok", text: next === "producao" ? "Produção ativada: as próximas cobranças são reais." : "Modo de teste ativado: as próximas cobranças usam o ambiente de testes." }); router.refresh(); }
  };

  return (
    <section className={clsx("rounded-2xl border-2 p-5", env === "producao" ? "border-ok/50 bg-ok-50/40" : "border-warn/50 bg-warn-50/50")}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <div className="label">Modo de pagamento</div>
          <div className="text-xl font-extrabold">{env === "producao" ? "Produção · cobranças reais" : "Teste · nenhum dinheiro real"}</div>
          <p className="text-sm text-gray">Vale para todos os gateways ativos e para as próximas cobranças. A troca fica registrada na auditoria.</p>
        </div>
        <div role="radiogroup" aria-label="Modo de pagamento" className="grid grid-cols-2 rounded-2xl bg-white p-1 shadow-sm">
          <button role="radio" aria-checked={env === "sandbox"} disabled={busy} onClick={() => env !== "sandbox" && apply("sandbox")}
            className={clsx("flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-bold", env === "sandbox" ? "bg-warn text-white" : "text-gray")}>
            <FlaskConical size={16} /> Teste
          </button>
          <button role="radio" aria-checked={env === "producao"} disabled={busy} onClick={() => env !== "producao" && setConfirming(true)}
            className={clsx("flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-bold", env === "producao" ? "bg-ok text-white" : "text-gray")}>
            <Rocket size={16} /> Produção
          </button>
        </div>
      </div>
      {confirming && (
        <div className="mt-4 space-y-2 rounded-xl border border-line bg-white p-4">
          {!prodReady && <Notice tone="danger">Faltam credenciais de produção em algum gateway ativo. Cadastre-as abaixo antes de ativar.</Notice>}
          <p className="text-sm">Para ativar a <b>Produção</b>, digite <b className="mono">PRODUCAO</b>. Clientes passarão a pagar de verdade.</p>
          <div className="flex gap-2">
            <input className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="PRODUCAO" aria-label="Confirmação" />
            <button className="btn-primary" disabled={typed.trim().toUpperCase() !== "PRODUCAO" || !prodReady || busy} onClick={() => apply("producao")}>{busy ? <Loader2 size={16} className="animate-spin" /> : "Ativar produção"}</button>
            <button className="btn-secondary" onClick={() => { setConfirming(false); setTyped(""); }}>Cancelar</button>
          </div>
        </div>
      )}
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </section>
  );
}

/** Menu de credenciais de um fornecedor, por ambiente. Mostra só os 4 últimos caracteres (RF-186). */
export function CredentialsEditor({ provider, creds, webhookUrl }: { provider: string; creds: Cred[]; webhookUrl: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Env>("sandbox");
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const save = async () => {
    const entries = Object.entries(values).filter(([, v]) => v.trim());
    if (!entries.length) { setMsg({ tone: "danger", text: "Preencha pelo menos um campo para trocar." }); return; }
    setBusy(true);
    setMsg(null);
    for (const [kind, value] of entries) {
      const { error } = await supabaseBrowser().rpc("admin_set_gateway_secret", { p_provider: provider, p_env: tab, p_kind: kind, p_value: value });
      if (error) { setBusy(false); setMsg({ tone: "danger", text: error.message }); return; }
    }
    setBusy(false);
    setValues({});
    setMsg({ tone: "ok", text: "Credenciais salvas no cofre. Já valem para as próximas cobranças." });
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 rounded-xl bg-ice p-1 text-sm font-semibold" role="tablist">
        {(["sandbox", "producao"] as Env[]).map((e) => (
          <button key={e} role="tab" aria-selected={tab === e} onClick={() => { setTab(e); setValues({}); setMsg(null); }}
            className={clsx("flex min-h-9 items-center justify-center gap-1.5 rounded-lg", tab === e ? "bg-white shadow-sm" : "text-gray")}>
            {e === "sandbox" ? "Teste" : "Produção"} {readiness(creds, provider, e) ? <ShieldCheck size={14} className="text-ok" /> : <span className="h-2 w-2 rounded-full bg-warn" />}
          </button>
        ))}
      </div>
      {FIELDS[provider].map((f) => {
        const saved = creds.find((c) => c.provider === provider && c.environment === tab && c.kind === f.kind);
        const id = `${provider}-${tab}-${f.kind}`;
        return (
          <div key={f.kind}>
            <label htmlFor={id} className="flex items-center justify-between text-xs font-semibold">
              <span>{f.label}{f.required ? "" : " (opcional)"}</span>
              {saved ? <span className="mono text-[11px] text-ok">salva ····{saved.last4} · {new Date(saved.updated_at).toLocaleDateString("pt-BR")}</span> : <span className="text-[11px] text-warn">não cadastrada</span>}
            </label>
            <div className="mt-1 flex gap-1.5">
              <input id={id} className="input mono text-xs" type={show[f.kind] ? "text" : "password"} autoComplete="off" value={values[f.kind] ?? ""}
                onChange={(e) => setValues({ ...values, [f.kind]: e.target.value })} placeholder={saved ? "Cole um novo valor para trocar" : "Cole aqui"} />
              <button type="button" className="btn-ghost w-11 shrink-0 px-0" onClick={() => setShow({ ...show, [f.kind]: !show[f.kind] })} aria-label={show[f.kind] ? "Ocultar" : "Mostrar o que digitei"}>
                {show[f.kind] ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="mt-0.5 text-[11px] text-gray">{f.hint}</p>
          </div>
        );
      })}
      <button className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Salvar credenciais de {tab === "sandbox" ? "teste" : "produção"}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div>
        <div className="label mb-1">URL do webhook para cadastrar no {provider === "asaas" ? "Asaas" : provider === "mercado_pago" ? "Mercado Pago" : "Stripe"}</div>
        <CopyField value={webhookUrl} />
      </div>
    </div>
  );
}

/** Liga/desliga o fornecedor e define o papel: principal, reserva (failover) ou internacional. */
export function ProviderSwitch({ id, active, role, ready }: { id: string; active: boolean; role: string; ready: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const update = async (patch: Record<string, unknown>) => {
    setMsg(null);
    const { error } = await supabaseBrowser().from("payment_gateways").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setMsg(error.message.includes("duplicate") ? "Esse fornecedor já tem esse papel." : error.message);
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={active} onChange={(e) => update({ active: e.target.checked })} /> Ativo
      </label>
      <select className="input w-auto" value={role} onChange={(e) => update({ role: e.target.value })} aria-label="Papel">
        <option value="principal">Principal (Pix)</option>
        <option value="reserva">Reserva (Pix, se o principal falhar)</option>
        <option value="internacional">Cartão / internacional</option>
      </select>
      {active && !ready && <Pill tone="warn">faltam credenciais no modo atual</Pill>}
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </div>
  );
}
