"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function CopyField({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input mono text-xs" aria-label="URL do webhook" />
      <button type="button" className="btn-secondary shrink-0" onClick={async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }} aria-label="Copiar">
        {ok ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

type Cfg = { pix?: boolean; cartao?: boolean; boleto?: boolean; pix_expiracao_min?: number; parcelas_max?: number; tres_ds?: boolean; [k: string]: unknown };

export function GatewayEditor({ id, active, environment, config, editable }: { id: string; active: boolean; environment: string; config: Cfg; editable: boolean }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<Cfg>(config);
  void active; void environment;
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    const { error } = await supabaseBrowser().from("payment_gateways").update({ config: cfg, updated_at: new Date().toISOString() }).eq("id", id);
    setMsg(error ? error.message : "Salvo.");
    router.refresh();
  };

  if (!editable) return <p className="text-sm text-gray">Integração prevista para a V1.</p>;
  return (
    <div className="space-y-2 text-sm">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="label mb-1">Meios</legend>
        {(["pix", "cartao", "boleto"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5 capitalize"><input type="checkbox" checked={!!cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} /> {k === "cartao" ? "cartão" : k}</label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">Expiração do Pix (min)<input type="number" className="input mono mt-1" value={cfg.pix_expiracao_min ?? 30} onChange={(e) => setCfg({ ...cfg, pix_expiracao_min: Number(e.target.value) })} /></label>
        <label className="block">Parcelas no cartão<input type="number" className="input mono mt-1" value={cfg.parcelas_max ?? 3} onChange={(e) => setCfg({ ...cfg, parcelas_max: Number(e.target.value) })} /></label>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={!!cfg.tres_ds} onChange={(e) => setCfg({ ...cfg, tres_ds: e.target.checked })} /> 3D Secure no cartão</label>
      <button className="btn-primary btn-sm" onClick={save}>Salvar</button>
      {msg && <span className="ml-2 text-xs text-gray">{msg}</span>}
      <p className="text-xs text-gray">Pix: Asaas e Mercado Pago. Cartão: Stripe. Boleto fica para a próxima etapa.</p>
    </div>
  );
}

const SETTING_LABEL: Record<string, string> = { welcome_credits: "Créditos de boas-vindas por cadastro", free_previews_per_day: "Prévias grátis por dia por conta" };

export function SettingsEditor({ settings }: { settings: { key: string; value: unknown }[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setMsg(null);
    const sb = supabaseBrowser();
    for (const [key, v] of Object.entries(values)) {
      const n = Number(v);
      const { error } = await sb.from("app_settings").update({ value: Number.isFinite(n) ? n : v }).eq("key", key);
      if (error) { setMsg(error.message); return; }
    }
    setMsg("Configurações salvas.");
    router.refresh();
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {settings.map((s) => (
          <label key={s.key} className="block text-sm font-semibold">{SETTING_LABEL[s.key] ?? s.key}
            <input className="input mono mt-1 font-normal" value={values[s.key] ?? ""} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
          </label>
        ))}
      </div>
      <button className="btn-primary btn-sm" onClick={save}>Salvar configurações</button>
      {msg && <span className="ml-2 text-xs text-gray">{msg}</span>}
    </div>
  );
}
