import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/server";
import { gatewaySecret, ROTTA_REF } from "@/lib/payments/config";
import { asaasPaymentStatus } from "@/lib/payments/providers";

// Webhook do Asaas (RF-181, RF-186): token verificado, processamento idempotente pelo id do evento.
const STATUS: Record<string, string> = {
  PAYMENT_RECEIVED: "pago",
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_OVERDUE: "expirado",
  PAYMENT_DELETED: "falhou",
  PAYMENT_RECEIVED_IN_CASH: "pago",
};

export async function POST(req: Request) {
  const token = req.headers.get("asaas-access-token");
  // aceita o token de qualquer ambiente: cobranças de teste abertas continuam sendo confirmadas após a troca de modo
  const [sandbox, prod] = await Promise.all([gatewaySecret("asaas", "sandbox", "webhook_token"), gatewaySecret("asaas", "producao", "webhook_token")]);
  if (!token || (token !== sandbox && token !== prod)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const env = token === prod ? "producao" : "sandbox";

  const evt = await req.json().catch(() => null);
  if (!evt?.event) return NextResponse.json({ ok: true, ignored: "sem evento" });
  const status = STATUS[evt.event];
  const paymentId = evt.payment?.id;
  if (!status || !paymentId) return NextResponse.json({ ok: true, ignored: evt.event });
  // a conta do Asaas pode ter cobranças de outros produtos: só processa as do Rotta 365
  if (!String(evt.payment?.externalReference ?? "").startsWith(`${ROTTA_REF}:`)) return NextResponse.json({ ok: true, ignored: "outro produto" });

  // confirma o status direto na API do Asaas antes de liberar crédito
  if (status === "pago") {
    const real = await asaasPaymentStatus(env, paymentId).catch(() => null);
    if (!real) return NextResponse.json({ error: "não consegui confirmar no Asaas" }, { status: 500 });
    if (real.status !== "pago") return NextResponse.json({ ok: true, ignored: "ainda não pago no Asaas" });
  }
  const { data, error } = await supabaseAnon().rpc("confirm_payment", {
    p_secret: process.env.INTERNAL_SECRET,
    p_provider: "asaas",
    p_event: evt.event,
    p_external_id: String(evt.id || `${evt.event}:${paymentId}`),
    p_gateway_id: paymentId,
    p_status: status,
    p_payload: evt,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // 500 faz o Asaas reenviar
  return NextResponse.json({ ok: true, result: data });
}
