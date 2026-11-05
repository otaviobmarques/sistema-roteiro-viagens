"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Copy, Check, X } from "lucide-react";
import { buildPixPayload } from "@/lib/domain/pix";
import { fmtBRL, type Transfer } from "@/lib/domain/settle";
import { memberName, type Member } from "@/lib/types";
import { Avatar, Notice } from "@/components/ui";
import type { ExpenseFull } from "./expenses-client";

/** Tela 09 · Acerto via Pix (RF-075): QR Code e copia e cola com a chave de quem recebe. */
export function PixSettleModal({ transfer, from, to, tripTitle, expenses, onClose, onPaid }: {
  transfer: Transfer; from?: Member; to?: Member; tripTitle: string; expenses: ExpenseFull[]; onClose: () => void; onPaid: () => void;
}) {
  const key = to?.profiles?.pix_key?.trim() || null;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const payload = useMemo(() => key ? buildPixPayload({
    key, name: memberName(to), city: "BRASIL", amountCents: transfer.cents,
    txid: `ROTTA${Date.now().toString(36).toUpperCase()}`, description: `Rotta 365 ${tripTitle}`.slice(0, 40),
  }) : null, [key, to, transfer.cents, tripTitle]);

  useEffect(() => {
    if (payload) QRCode.toDataURL(payload, { width: 260, margin: 1, color: { dark: "#0A1F4C", light: "#FFFFFF" } }).then(setQr);
  }, [payload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Composição: gastos pagos por quem recebe em que quem paga tem parte
  const composition = expenses
    .filter((e) => e.expense_payers.some((p) => p.member_id === transfer.to))
    .map((e) => ({ e, part: e.expense_shares.find((s) => s.member_id === transfer.from)?.amount_cents ?? 0 }))
    .filter((x) => x.part > 0);

  const copy = async () => {
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pix-title">
      <div className="absolute inset-0 bg-navy/40" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-[var(--shadow-pop)] sm:rounded-3xl">
        <button className="btn-ghost absolute right-3 top-3 w-10 px-0" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        <div className="label">Acerto via Pix</div>
        <h2 id="pix-title" className="mt-1 text-xl font-extrabold">{memberName(from)} paga {memberName(to)}</h2>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={memberName(from)} size={34} />
          <span className="text-gray">→</span>
          <Avatar name={memberName(to)} url={to?.profiles?.avatar_url} size={34} />
          <span className="mono ml-auto text-2xl font-semibold">{fmtBRL(transfer.cents)}</span>
        </div>

        {!key ? (
          <div className="mt-4 space-y-2">
            <Notice tone="warn">{memberName(to)} ainda não cadastrou uma chave Pix. Para receber, a pessoa cadastra a chave em <Link href="/app/perfil" className="font-semibold underline">Perfil e conta</Link>.</Notice>
            {!to?.user_id && <p className="text-xs text-gray">Participante sem conta no app: combine o pagamento por fora e marque como pago.</p>}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3">
            {qr ? <img src={qr} alt={`QR Code Pix de ${fmtBRL(transfer.cents)} para ${memberName(to)}`} width={240} height={240} className="rounded-xl border border-line" /> : <div className="h-[240px] w-[240px] animate-pulse rounded-xl bg-ice" />}
            <div className="w-full">
              <div className="label mb-1">Pix copia e cola</div>
              <div className="mono break-all rounded-xl border border-line bg-ice p-2.5 text-[11px] text-navy">{payload}</div>
              <button className="btn-secondary mt-2 w-full" onClick={copy}>{copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar código</>}</button>
            </div>
            <p className="text-center text-[11px] text-gray">Abra o app do banco, escolha Pix → QR Code ou Copia e cola. Chave de {memberName(to)}: <span className="mono">{key}</span></p>
          </div>
        )}

        <div className="mt-5">
          <div className="label mb-1">Composição do valor</div>
          {composition.length ? (
            <ul className="space-y-1 text-sm">
              {composition.slice(0, 8).map(({ e, part }) => (
                <li key={e.id} className="flex justify-between gap-2"><span className="truncate">{e.description}</span><span className="mono">{fmtBRL(part)}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray">Valor líquido após compensar os gastos entre o grupo.</p>}
          <p className="mt-2 text-[11px] text-gray">O total pode ser menor que a soma acima porque o Pino já compensa o que cada um pagou pelo outro.</p>
        </div>

        <div className="mt-5 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Voltar</button>
          <button className="btn-primary flex-1" onClick={onPaid}>Marcar como pago</button>
        </div>
      </div>
    </div>
  );
}
