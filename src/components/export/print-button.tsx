"use client";
import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";

export function PrintButton() {
  return <button className="btn-secondary btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>;
}

/** Baixa o PDF gerado no servidor (igual em qualquer aparelho). */
export function DownloadPdfButton({ tripId, title }: { tripId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/trips/${tripId}/pdf`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Não consegui gerar o PDF agora.");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rotta 365 - ${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Viagem"} - Roteiro.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button className="btn-primary btn-sm" onClick={download} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {busy ? "Gerando PDF…" : "Baixar PDF"}
      </button>
      {err && <span className="text-xs text-danger" role="alert">{err}</span>}
    </span>
  );
}
