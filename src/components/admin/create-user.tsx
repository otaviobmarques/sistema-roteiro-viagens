"use client";
// Backoffice: cadastrar cliente com usuário (ou e-mail) e senha, com créditos de cortesia.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, RefreshCw, Copy, Check, Loader2, MessageCircle, Eye, EyeOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Notice } from "@/components/ui";

export function generatePassword(len = 10) {
  // sem caracteres que confundem (0/O, 1/l/I)
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#$%&*!"];
  const all = sets.join("");
  const rnd = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

export function CreateUser({ siteUrl }: { siteUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [show, setShow] = useState(true);
  const [credits, setCredits] = useState("1");
  const [note, setNote] = useState("Cortesia");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; login: string; password: string; credits: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const suggestLogin = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".").replace(/[^a-z0-9.]/g, "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const c = Math.max(0, Number(credits) || 0);
    const { error } = await supabaseBrowser().rpc("admin_create_user", { p_login: login.trim(), p_password: password, p_name: name.trim(), p_credits: c, p_note: note.trim() || "Cortesia" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone({ name: name.trim(), login: login.trim(), password, credits: c });
    router.refresh();
  };

  const message = done
    ? `Oi, ${done.name.split(" ")[0] || ""}! Sua conta no Rotta 365 está pronta 🎉\n\nAcesse: ${siteUrl}/entrar\nUsuário: ${done.login}\nSenha: ${done.password}\n\n${done.credits ? `Você ganhou ${done.credits} crédito${done.credits > 1 ? "s" : ""} de roteiro completo de cortesia (mais 1 de boas-vindas). ` : ""}Depois de entrar, você pode trocar a senha em Perfil e conta.`
    : "";

  const reset = () => { setDone(null); setName(""); setLogin(""); setPassword(generatePassword()); setCredits("1"); setNote("Cortesia"); setCopied(false); };

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}><UserPlus size={16} /> Cadastrar cliente</button>;

  if (done) {
    return (
      <div className="card space-y-3 p-5">
        <Notice tone="ok">Conta de <b>{done.name || done.login}</b> criada e já liberada para entrar.</Notice>
        <div className="label">Mensagem para enviar ao cliente</div>
        <pre className="mono whitespace-pre-wrap rounded-xl bg-ice p-3 text-xs">{message}</pre>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar mensagem"}</button>
          <a className="btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Enviar pelo WhatsApp</a>
          <button className="btn-primary btn-sm" onClick={reset}><UserPlus size={14} /> Cadastrar outro</button>
          <button className="btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>Fechar</button>
        </div>
        <p className="text-xs text-gray">A senha não fica visível depois que você fechar esta janela. Se o cliente esquecer, use “Senha” na lista para definir uma nova.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <div className="flex items-center justify-between"><h2 className="font-bold">Cadastrar cliente</h2><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancelar</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Nome
          <input className="input mt-1" value={name} onChange={(e) => { setName(e.target.value); if (!login || login === suggestLogin(name)) setLogin(suggestLogin(e.target.value)); }} required placeholder="Maria Souza" />
        </label>
        <label className="block text-sm font-semibold">Usuário ou e-mail
          <input className="input mono mt-1" value={login} onChange={(e) => setLogin(e.target.value)} required autoCapitalize="none" placeholder="maria.souza ou maria@email.com" />
          <span className="mt-0.5 block text-[11px] font-normal text-gray">Com e-mail, a pessoa também pode recuperar a senha sozinha.</span>
        </label>
        <label className="block text-sm font-semibold">Senha
          <span className="mt-1 flex gap-1.5">
            <input className="input mono" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <button type="button" className="btn-secondary w-11 shrink-0 px-0" onClick={() => setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            <button type="button" className="btn-secondary w-11 shrink-0 px-0" onClick={() => setPassword(generatePassword())} aria-label="Gerar nova senha" title="Gerar senha forte"><RefreshCw size={15} /></button>
          </span>
          <span className="mt-0.5 block text-[11px] font-normal text-gray">Mínimo de 8 caracteres.</span>
        </label>
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <label className="block text-sm font-semibold">Créditos grátis
            <input className="input mono mt-1" type="number" min={0} max={1000} value={credits} onChange={(e) => setCredits(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">Motivo
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cortesia, parceria, influenciador…" />
          </label>
          <span className="col-span-2 text-[11px] text-gray">Somados ao crédito de boas-vindas. Valem 12 meses.</span>
        </div>
      </div>
      {err && <Notice tone="danger">{err}</Notice>}
      <button className="btn-primary" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Criar conta</button>
    </form>
  );
}
