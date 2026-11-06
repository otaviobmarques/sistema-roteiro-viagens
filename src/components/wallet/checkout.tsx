"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Copy, Check, Loader2, QrCode, CreditCard, FlaskConical } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtBRL } from "@/lib/domain/settle";
import { Notice, PinoAvatar } from "@/components/ui";

type Product = { id: string; name: string; credits: number; price_cents: number };
type Charge = { orderId: string; payload: string; image: string; expiresAt?: string; invoiceUrl?: string };

export function Checkout({ products, testMode = false, pixAvailable = true, cardAvailable = false }: { products: Product[]; testMode?: boolean; pixAvailable?: boolean; cardAvailable?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(products.find((p) => p.id === "combo_5")?.id ?? products[0]?.id);
  const [cpf, setCpf] = useState("");
  const [method, setMethod] = useState<"pix" | "cartao">(pixAvailable || !cardAvailable ? "pix" : "cartao");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [status, setStatus] = useState<string>("pendente");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling do pedido: o crédito só aparece quando o webhook do gateway confirmar (RF-181)
  useEffect(() => {
    if (!charge) return;
    const sb = supabaseBrowser();
    const check = async () => {
      const { data } = await sb.from("orders").select("status").eq("id", charge.orderId).maybeSingle();
      if (data?.status) setStatus(data.status);
      if (data?.status && data.status !== "pendente") {
        if (timer.current) clearInterval(timer.current);
        router.refresh();
      }
    };
    timer.current = setInterval(check, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [charge, router]);

  const buy = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: selected, cpf, method }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível criar a cobrança.");
      if (data.redirect) { window.location.href = data.redirect; return; } // cartão: checkout seguro da Stripe
      setCharge(data);
      setStatus("pendente");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!charge) return;
    await navigator.clipboard.writeText(charge.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (charge) {
    const product = products.find((p) => p.id === selected);
    return (
      <div className="space-y-4">
        {status === "pago" ? (
          <div className="flex items-center gap-3 rounded-xl border border-ok/30 bg-ok-50 p-4 text-ok">
            <PinoAvatar mood="partiu" size={44} />
            <div><div className="font-bold">Partiu! Pagamento confirmado.</div><div className="text-sm">{product?.credits} crédito(s) já estão na sua carteira.</div></div>
          </div>
        ) : status !== "pendente" ? (
          <Notice tone="danger">Este pagamento ficou como “{status}”. Gere uma nova cobrança se quiser tentar de novo.</Notice>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${charge.image}`} alt="QR Code Pix" width={200} height={200} className="rounded-xl border border-line bg-white p-2" />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <div className="font-semibold">{product?.name} · <span className="mono">{fmtBRL(product?.price_cents)}</span></div>
                <p className="text-gray">Abra o app do seu banco, escolha Pix e leia o QR Code, ou use o copia e cola.</p>
                <div className="flex gap-2">
                  <input readOnly value={charge.payload} className="input mono text-xs" aria-label="Pix copia e cola" />
                  <button onClick={copy} className="btn-secondary shrink-0" aria-label="Copiar código Pix">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray" aria-live="polite"><Loader2 size={14} className="animate-spin" /> Aguardando a confirmação do banco…</div>
              </div>
            </div>
          </>
        )}
        <button className="btn-ghost btn-sm" onClick={() => { setCharge(null); setStatus("pendente"); }}>Voltar aos produtos</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {testMode && (
        <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn-50 px-3 py-2 text-sm text-[#7a5212]">
          <FlaskConical size={16} className="mt-0.5 shrink-0" /> <span><b>Modo de teste:</b> as cobranças usam o ambiente de testes do gateway e nenhum dinheiro real é cobrado.</span>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Produtos">
        {products.map((p) => {
          const per = Math.round(p.price_cents / p.credits);
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(p.id)}
              className={clsx("relative rounded-xl border p-3 text-left transition", active ? "border-blue bg-blue-50 ring-4 ring-blue/10" : "border-line bg-white hover:border-blue/40")}
            >
              {p.id === "combo_5" && <span className="absolute right-2 top-2 rounded-full bg-blue px-2 text-[10px] font-semibold text-white">mais escolhido</span>}
              <div className="label">{p.credits === 1 ? "Avulso" : `Combo ${p.credits}`}</div>
              <div className="mono text-xl font-semibold">{fmtBRL(p.price_cents)}</div>
              <div className="text-xs text-gray">{p.credits > 1 ? `${fmtBRL(per)} por roteiro · 12 meses` : "1 roteiro completo + PDF"}</div>
            </button>
          );
        })}
      </div>
      {pixAvailable && cardAvailable && (
        <div role="radiogroup" aria-label="Forma de pagamento" className="grid max-w-sm grid-cols-2 rounded-xl bg-ice p-1 text-sm font-semibold">
          {(["pix", "cartao"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={clsx("flex min-h-10 items-center justify-center gap-1.5 rounded-lg", method === m ? "bg-white shadow-sm" : "text-gray")}>
              {m === "pix" ? <><QrCode size={15} /> Pix</> : <><CreditCard size={15} /> Cartão</>}
            </button>
          ))}
        </div>
      )}
      {method === "pix" && <div>
        <label htmlFor="cpf" className="mb-1 block text-sm font-semibold">CPF ou CNPJ <span className="font-normal text-gray">(exigido pelo banco para emitir o Pix)</span></label>
        <input id="cpf" inputMode="numeric" className="input mono" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} />
      </div>}
      {error && <Notice tone="danger">{error}</Notice>}
      <button onClick={buy} disabled={loading || !selected} className="btn-primary w-full sm:w-auto">
        {loading ? <Loader2 size={16} className="animate-spin" /> : method === "pix" ? <QrCode size={16} /> : <CreditCard size={16} />} {method === "pix" ? "Pagar com Pix" : "Pagar com cartão"}
      </button>
      <p className="text-xs text-gray">O roteiro só é gerado depois da confirmação do pagamento. Se a geração falhar, nenhum crédito é cobrado.</p>
    </div>
  );
}
