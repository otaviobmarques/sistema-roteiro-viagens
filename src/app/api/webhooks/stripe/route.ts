import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/server";
import { gatewaySecret, ROTTA_REF, type PayEnv } from "@/lib/payments/config";
import { stripeSignatureOk, stripeSessionForPaymentIntent } from "@/lib/payments/providers";

// Webhook da Stripe: assinatura Stripe-Signature verificada sobre o corpo bruto.
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  let env: PayEnv | null = null;
  for (const e of ["producao", "sandbox"] as PayEnv[]) {
    const secret = await gatewaySecret("stripe", e, "webhook_secret");
    if (secret && stripeSignatureOk(secret, sig, raw)) { env = e; break; }
  }
  if (!env) return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });

  const evt = JSON.parse(raw);
  const obj = evt.data?.object ?? {};
  let sessionId: string | null = null;
  let status: string | null = null;
  if (evt.type === "checkout.session.completed" || evt.type === "checkout.session.async_payment_succeeded") {
    if (!String(obj.client_reference_id ?? "").startsWith(`${ROTTA_REF}:`)) return NextResponse.json({ ok: true, ignored: "outro produto" });
    if (obj.payment_status !== "paid") return NextResponse.json({ ok: true, pending: true });
    sessionId = obj.id; status = "pago";
  } else if (evt.type === "checkout.session.expired" || evt.type === "checkout.session.async_payment_failed") {
    sessionId = obj.id; status = "expirado";
  } else if (evt.type === "charge.refunded" && obj.payment_intent) {
    sessionId = await stripeSessionForPaymentIntent(env, obj.payment_intent); status = "estornado";
  }
  if (!sessionId || !status) return NextResponse.json({ ok: true, ignored: evt.type });

  const { data, error } = await supabaseAnon().rpc("confirm_payment", {
    p_secret: process.env.INTERNAL_SECRET, p_provider: "stripe", p_event: evt.type,
    p_external_id: String(evt.id), p_gateway_id: sessionId, p_status: status, p_payload: { id: evt.id, type: evt.type, object: obj.id },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
