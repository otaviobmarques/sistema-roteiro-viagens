"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Mail, ShieldCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ next, initialMode }: { next: string; initialMode: "entrar" | "criar" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [useLink, setUseLink] = useState(false);
  const router = useRouter();
  const sb = supabaseBrowser();
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const google = async () => {
    setBusy(true);
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) { setMsg({ tone: "err", text: "O login com Google ainda não foi ativado neste ambiente. Use e-mail e senha." }); setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (useLink) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), data: name ? { name } : undefined } });
        if (error) throw error;
        setMsg({ tone: "ok", text: "Pronto! Mandamos um link de acesso para o seu e-mail." });
      } else if (mode === "criar") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo(), data: { name } } });
        if (error) throw error;
        if (data.session) router.replace("/app/onboarding");
        else setMsg({ tone: "ok", text: "Conta criada! Confirme pelo link que enviamos ao seu e-mail e depois entre." });
      } else {
        // aceita nome de usuário (ex.: "admin") além de e-mail
        const login = email.includes("@") ? email.trim() : `${email.trim().toLowerCase()}@usuarios.rotta365.app`;
        const { error } = await sb.auth.signInWithPassword({ email: login, password });
        if (error) throw error;
        router.replace(safeNext);
        router.refresh();
      }
    } catch (err) {
      const m = (err as Error).message || "";
      const text = /Invalid login/i.test(m) ? "E-mail ou senha incorretos." : /Email not confirmed/i.test(m) ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : /rate limit/i.test(m) ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos." : /Password should/i.test(m) ? "A senha precisa ter pelo menos 6 caracteres." : m;
      setMsg({ tone: "err", text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="grid grid-cols-2 rounded-xl bg-ice p-1 text-sm font-semibold" role="tablist">
        {(["entrar", "criar"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setMsg(null); }} className={clsx("min-h-10 rounded-lg", mode === m ? "bg-white shadow-sm" : "text-gray")}>
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>
      <h2 className="mt-5 text-xl font-extrabold">{mode === "entrar" ? "Bem-vindo de volta" : "Vamos planejar sua viagem"}</h2>
      <p className="text-sm text-gray">{mode === "entrar" ? "Entre para continuar seus roteiros." : "Crie sua conta grátis. Você ganha 1 crédito de roteiro para testar."}</p>

      <button onClick={google} disabled={busy} className="btn-secondary mt-5 w-full">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continuar com Google
      </button>
      <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-gray"><span className="h-px flex-1 bg-line" /> ou com e-mail <span className="h-px flex-1 bg-line" /></div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "criar" && (
          <label className="block"><span className="mb-1 block text-xs font-semibold">Como podemos te chamar?</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
        )}
        <label className="block"><span className="mb-1 block text-xs font-semibold">{mode === "entrar" && !useLink ? "E-mail ou usuário" : "E-mail"}</span>
          <input className="input" type={mode === "entrar" && !useLink ? "text" : "email"} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete={mode === "entrar" ? "username" : "email"} autoCapitalize="none" placeholder={mode === "entrar" && !useLink ? "voce@exemplo.com ou usuário" : "voce@exemplo.com"} /></label>
        {!useLink && (
          <label className="block"><span className="mb-1 block text-xs font-semibold">Senha</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "criar" ? "new-password" : "current-password"} /></label>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Aguarde…" : useLink ? "Receber link de acesso" : mode === "entrar" ? "Entrar" : "Criar conta"}</button>
      </form>
      <button onClick={() => setUseLink(!useLink)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue"><Mail size={14} /> {useLink ? "Usar senha" : "Entrar sem senha (link mágico)"}</button>

      {msg && <p className={clsx("mt-4 rounded-xl px-3 py-2 text-sm", msg.tone === "ok" ? "bg-ok-50 text-ok" : "bg-danger-50 text-danger")} role="status">{msg.text}</p>}
      <div className="mt-5 flex gap-2 rounded-xl bg-ice p-3 text-xs text-gray"><ShieldCheck size={16} className="shrink-0 text-blue" />Ao continuar, você aceita os Termos e a Política de Privacidade (LGPD). Seus dados de viagem são só seus e do seu grupo.</div>
    </div>
  );
}
