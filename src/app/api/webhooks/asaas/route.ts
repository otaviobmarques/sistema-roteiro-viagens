import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/server";

// Webhook do Asaas (RF-181, RF-186): token verificado, processamento idempotente pelo id do evento.
const STATUS: Record<string, string> = {
  PAYMENT_RECEIVED: "pago",
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_OVERDUE: "expirado",
  PAYMENT_DELETED: "falhou",
};

export async function POST(req: Request) {
  const token = req.headers.get("asaas-access-token");
  if (!process.env.ASAAS_WEBHOOK_TOKEN || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const evt = await req.json().catch(() => null);
  if (!evt?.event) return NextResponse.json({ ok: true, ignored: "sem evento" });
  const status = STATUS[evt.event];
  const paymentId = evt.payment?.id;
  if (!status || !paymentId) return NextResponse.json({ ok: true, ignored: evt.event });

  const externalId = evt.id || `${evt.event}:${paymentId}`;
  const { data, error } = await supabaseAnon().rpc("confirm_payment", {
    p_secret: process.env.INTERNAL_SECRET,
    p_provider: "asaas",
    p_event: evt.event,
    p_external_id: String(externalId),
    p_gateway_id: paymentId,
    p_status: status,
    p_payload: evt,
  });
  if (error) {
    // 500 faz o Asaas tentar de novo (até 24 h)
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
