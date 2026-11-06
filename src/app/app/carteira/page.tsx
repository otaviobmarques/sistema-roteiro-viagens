import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { PageTitle, PinoAvatar, Pill, Notice, EmptyState } from "@/components/ui";
import { fmtBRL } from "@/lib/domain/settle";
import { Checkout } from "@/components/wallet/checkout";
import { paymentConfig, pixProviders, cardProvider } from "@/lib/payments/config";
import { Check } from "lucide-react";

export const metadata = { title: "Carteira" };

const KIND_LABEL: Record<string, string> = {
  compra: "Compra", consumo: "Roteiro gerado", estorno: "Estorno", bonus: "Bônus", expiracao: "Expiração", transferencia: "Transferência",
};
const ORDER_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  pendente: { label: "Aguardando pagamento", tone: "warn" },
  pago: { label: "Pago", tone: "ok" },
  estornado: { label: "Estornado", tone: "neutral" },
  expirado: { label: "Expirado", tone: "neutral" },
  falhou: { label: "Falhou", tone: "danger" },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const { trip: tripId } = await searchParams;
  const { supabase, user } = await requireUser();
  const pay = await paymentConfig().catch(() => null);
  const [{ data: wallet }, { data: products }, { data: txs }, { data: orders }, tripRes] = await Promise.all([
    supabase.from("credit_wallets").select("balance, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("products").select("*").eq("active", true).order("price_cents"),
    supabase.from("credit_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("orders").select("id, product_id, amount_cents, method, status, created_at, paid_at, invoice_url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    tripId ? supabase.from("trips").select("id, title, generated").eq("id", tripId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const trip = tripRes.data as { id: string; title: string; generated: boolean } | null;
  const balance = wallet?.balance ?? 0;
  const nextExpiry = (txs ?? []).filter((t) => t.amount > 0 && t.expires_at && new Date(t.expires_at) > new Date()).map((t) => t.expires_at as string).sort()[0];
  const productNames = new Map((products ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Conta" title="Carteira de roteiros" />

      {trip && (
        <div className="card pino-border flex flex-wrap items-center gap-4 p-5">
          <PinoAvatar mood="achei" size={56} />
          <div className="min-w-0 flex-1">
            <div className="label">Desbloquear roteiro</div>
            <h2 className="text-lg font-bold">{trip.title}</h2>
            <p className="text-sm text-gray">
              {trip.generated
                ? "Este roteiro já foi desbloqueado. Ajustes na mesma viagem não consomem crédito."
                : balance > 0
                  ? "Você já tem crédito. Volte para a viagem e gere o roteiro completo."
                  : "Compre 1 roteiro avulso ou um combo. Assim que o Pix for confirmado, o crédito aparece aqui e você gera o roteiro."}
            </p>
          </div>
          <Link href={`/app/nova?trip=${trip.id}`} className={balance > 0 || trip.generated ? "btn-primary" : "btn-secondary"}>Voltar e gerar</Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <section className="hero-gradient rounded-2xl p-5 text-white shadow-[var(--shadow-card)]" aria-label="Saldo">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">Saldo</div>
          <div className="mono mt-1 text-5xl font-semibold">{balance}</div>
          <div className="text-sm text-white/85">crédito{balance === 1 ? "" : "s"} de roteiro completo</div>
          {nextExpiry && <div className="mt-3 text-xs text-white/75">Créditos válidos por 12 meses · próxima validade {new Date(nextExpiry).toLocaleDateString("pt-BR")}</div>}
          <div className="mt-4 rounded-xl bg-white/12 p-3 text-sm">
            <div className="mb-1.5 font-semibold">Um crédito inclui</div>
            <ul className="space-y-1 text-white/90">
              {["Roteiro completo verificado, com score e PDF", "Três perfis com preço e opções por item", "Trocar itens e mudar o perfil sem pagar de novo", "Refazer até 3 dias e incluir até 2 destinos novos"].map((t) => (
                <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0" />{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="comprar">
          <h2 id="comprar" className="text-lg font-bold">Comprar roteiros</h2>
          <p className="mb-4 text-sm text-gray">O resto do app é grátis: planejar à mão, convidar o grupo, dividir gastos e acertar via Pix.</p>
          <Checkout testMode={pay?.env !== "producao"} pixAvailable={pay ? pixProviders(pay).length > 0 : false} cardAvailable={pay ? !!cardProvider(pay) : false} products={(products ?? []).map((p) => ({ id: p.id, name: p.name, credits: p.credits, price_cents: p.price_cents }))} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Histórico de créditos</h2>
          {!txs?.length ? (
            <p className="text-sm text-gray">Nenhuma movimentação ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {txs.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{KIND_LABEL[t.kind] ?? t.kind}{t.note ? ` · ${t.note}` : ""}</div>
                    <div className="mono text-xs text-gray">
                      {fmtDateTime(t.created_at)}
                      {t.expires_at && t.amount > 0 ? ` · vale até ${new Date(t.expires_at).toLocaleDateString("pt-BR")}` : ""}
                    </div>
                  </div>
                  <span className={`mono font-semibold ${t.amount > 0 ? "text-ok" : "text-navy"}`}>{t.amount > 0 ? `+${t.amount}` : t.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Compras e recibos</h2>
          {!orders?.length ? (
            <EmptyState title="Nenhuma compra ainda" text="Quando você comprar um roteiro ou combo, o recibo aparece aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {orders.map((o) => {
                const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: "neutral" as const };
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{productNames.get(o.product_id) ?? o.product_id}</div>
                      <div className="mono text-xs text-gray">{fmtDateTime(o.created_at)} · {o.method.toUpperCase()}</div>
                    </div>
                    <span className="mono font-semibold">{fmtBRL(o.amount_cents)}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    {o.invoice_url && o.status === "pago" && <a className="text-xs font-semibold text-blue underline" href={o.invoice_url} target="_blank" rel="noreferrer">Recibo</a>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3"><Notice tone="blue">Nota fiscal (NFS-e) automática entra numa próxima versão. Dúvidas sobre cobrança: suporte@rotta365.app.</Notice></div>
        </section>
      </div>
    </div>
  );
}
