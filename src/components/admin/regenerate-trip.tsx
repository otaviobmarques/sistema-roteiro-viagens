"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

/** Suporte: refaz o roteiro do cliente sem cobrar (país inteiro vira cidades-base). */
export function RegenerateTrip({ tripId, title }: { tripId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    if (!confirm(`Refazer o roteiro "${title}"? O cliente não paga nada e os dias atuais serão substituídos.`)) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/admin/trips/${tripId}/regenerate`, { method: "POST" });
    const d = await r.json().catch(() => ({ error: "Erro inesperado" }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: `Pronto${d.changed?.length ? `: ${d.changed.join("; ")}` : ""}. Viabilidade ${d.viability}.` } : { ok: false, text: d.error });
    if (r.ok) router.refresh();
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button className="btn-ghost btn-sm" onClick={run} disabled={busy} title="Refazer sem cobrar do cliente">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {busy ? "Refazendo… (até 2 min)" : "Refazer"}
      </button>
      {msg && <span className={`max-w-[260px] text-right text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </span>
  );
}
