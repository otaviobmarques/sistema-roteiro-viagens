"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { generatePassword } from "./create-user";

export function UserActions({ userId, suspended }: { userId: string; suspended: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwDone, setPwDone] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setErr(error.message); else { setOpen(false); setPwOpen(false); router.refresh(); }
    return !error;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary btn-sm" onClick={() => { setOpen((v) => !v); setPwOpen(false); }} disabled={busy}>Créditos</button>
      <button className="btn-secondary btn-sm" onClick={() => { setPwOpen((v) => !v); setOpen(false); setPw(generatePassword()); setPwDone(null); }} disabled={busy}>Senha</button>
      <button
        className={suspended ? "btn-secondary btn-sm" : "btn-danger btn-sm"}
        disabled={busy}
        onClick={() => {
          if (!suspended && !confirm("Suspender este usuário? Ele perde o acesso ao app.")) return;
          run(() => supabaseBrowser().rpc("admin_set_suspended", { p_user: userId, p_value: !suspended }));
        }}
      >{suspended ? "Reativar" : "Suspender"}</button>
      {open && (
        <form
          className="flex w-full flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); run(() => supabaseBrowser().rpc("admin_grant_credits", { p_user: userId, p_amount: Number(amount), p_note: note || "Backoffice" })); }}
        >
          <input type="number" className="input mono w-20" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Quantidade (negativo remove)" />
          <input className="input min-w-0 flex-1" placeholder="Motivo (vai para a auditoria)" value={note} onChange={(e) => setNote(e.target.value)} required />
          <button className="btn-primary btn-sm" disabled={busy}>Aplicar</button>
        </form>
      )}
      {pwOpen && (
        <form
          className="flex w-full flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = pw;
            run(() => supabaseBrowser().rpc("admin_set_password", { p_user: userId, p_password: value })).then((ok) => { if (ok) setPwDone(value); });
          }}
        >
          <input className="input mono min-w-0 flex-1" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required aria-label="Nova senha" />
          <button className="btn-primary btn-sm" disabled={busy}>Definir senha</button>
        </form>
      )}
      {pwDone && !pwOpen && <span className="w-full text-xs text-ok">Nova senha definida: <b className="mono">{pwDone}</b> (copie e envie ao cliente)</span>}
      {err && <span className="w-full text-xs text-danger">{err}</span>}
    </div>
  );
}
