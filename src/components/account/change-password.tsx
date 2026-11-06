"use client";
// Trocar a própria senha (inclui contas criadas pelo administrador).
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Notice } from "@/components/ui";

export function ChangePassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const save = async () => {
    setMsg(null);
    if (pw.length < 8) { setMsg({ tone: "danger", text: "A senha precisa ter pelo menos 8 caracteres." }); return; }
    if (pw !== pw2) { setMsg({ tone: "danger", text: "As duas senhas não são iguais." }); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg({ tone: "danger", text: /different from the old/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : error.message });
    else { setMsg({ tone: "ok", text: "Senha trocada. Use a nova senha no próximo acesso." }); setPw(""); setPw2(""); }
  };
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Trocar senha</div>
      <input className="input" type="password" autoComplete="new-password" placeholder="Nova senha (mín. 8 caracteres)" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Nova senha" />
      <input className="input" type="password" autoComplete="new-password" placeholder="Repita a nova senha" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-label="Repita a nova senha" />
      <button type="button" className="btn-secondary w-full" onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Salvar nova senha</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
