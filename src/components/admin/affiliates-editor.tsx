"use client";
// Links de parceiros (afiliados) que aparecem no guia "Antes de ir" dos roteiros.
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Notice } from "@/components/ui";

type Aff = { seguro?: { url?: string; label?: string }; esim?: { url?: string; label?: string } };
const FIELDS: { key: "seguro" | "esim"; title: string; hint: string; placeholder: string }[] = [
  { key: "seguro", title: "Seguro viagem", hint: "Aparece no quadro Seguro viagem de cada país.", placeholder: "Cotar seguro viagem" },
  { key: "esim", title: "eSIM / internet", hint: "Aparece no quadro Celular e internet.", placeholder: "Comprar eSIM de viagem" },
];

export function AffiliatesEditor({ initial }: { initial: Aff }) {
  const [v, setV] = useState<Aff>(initial ?? {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const set = (k: "seguro" | "esim", f: "url" | "label", val: string) => setV({ ...v, [k]: { ...(v[k] ?? {}), [f]: val } });
  const save = async () => {
    setMsg(null);
    for (const { key } of FIELDS) {
      const u = v[key]?.url?.trim();
      if (u && !/^https:\/\//i.test(u)) { setMsg({ tone: "danger", text: "Os links precisam começar com https://" }); return; }
    }
    setBusy(true);
    const { error } = await supabaseBrowser().from("app_settings").update({ value: v }).eq("key", "affiliates");
    setBusy(false);
    setMsg(error ? { tone: "danger", text: error.message } : { tone: "ok", text: "Salvo. Os próximos PDFs já saem com os botões de parceiro." });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2 rounded-xl border border-line p-3">
            <div className="font-semibold">{f.title}</div>
            <p className="text-xs text-gray">{f.hint} Deixe o link vazio para não mostrar nenhum parceiro.</p>
            <label className="block text-xs font-semibold">Link de afiliado
              <input className="input mono mt-1" value={v[f.key]?.url ?? ""} onChange={(e) => set(f.key, "url", e.target.value)} placeholder="https://..." />
            </label>
            <label className="block text-xs font-semibold">Texto do botão
              <input className="input mt-1" value={v[f.key]?.label ?? ""} onChange={(e) => set(f.key, "label", e.target.value)} placeholder={f.placeholder} />
            </label>
          </div>
        ))}
      </div>
      <button className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar parceiros</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-xs text-gray">No roteiro, o botão aparece marcado como “parceiro”, com o aviso de que pode gerar comissão.</p>
    </div>
  );
}
