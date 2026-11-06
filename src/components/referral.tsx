"use client";
// Indique e ganhe: registra o padrinho de quem chegou pelo link, e o cartão com o link pessoal.
import { useEffect, useState } from "react";
import { Copy, Check, MessageCircle, Gift } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function ReferralClaim() {
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )rotta_ref=([a-z0-9]+)/);
    if (!m) return;
    supabaseBrowser().rpc("claim_referral", { p_code: m[1] }).then(() => {
      document.cookie = "rotta_ref=; Max-Age=0; path=/";
    });
  }, []);
  return null;
}

export function ReferralCard({ url, invited, rewarded, credits }: { url: string; invited: number; rewarded: number; credits: number }) {
  const [copied, setCopied] = useState(false);
  const text = `Tô usando o Rotta 365 para montar meus roteiros de viagem: você diz os destinos e o Pino monta tudo, dia a dia. Entra pelo meu link e ganha ${credits} roteiro extra na primeira compra: ${url}`;
  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center gap-2"><Gift size={18} className="text-blue" /><h2 className="text-lg font-bold">Indique e ganhe</h2></div>
      <p className="text-sm text-gray">Quem entrar pelo seu link ganha <b>{credits} crédito extra</b> na primeira compra, e você ganha <b>{credits} crédito</b> também.</p>
      <div className="mono truncate rounded-xl bg-ice px-3 py-2 text-sm">{url}</div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar link"}</button>
        <a className="btn-primary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Enviar pelo WhatsApp</a>
      </div>
      <div className="flex gap-4 text-xs text-gray"><span><b className="mono text-navy">{invited}</b> amigo(s) entraram</span><span><b className="mono text-navy">{rewarded}</b> já compraram (você ganhou)</span></div>
    </section>
  );
}
