import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/server";
import { gatewaySecret, ROTTA_REF, type PayEnv } from "@/lib/payments/config";
import { mercadoPagoSignatureOk, mercadoPagoStatus } from "@/lib/payments/providers";

// Webhook do Mercado Pago: assinatura x-signature verificada e status consultado na API (nunca confiamos no corpo).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const type = body.type || url.searchParams.get("type") || url.searchParams.get("topic");
  const dataId = String(body.data?.id || url.searchParams.get("data.id") || "");
  if (type !== "payment" || !dataId) return NextResponse.json({ ok: true, ignored: type ?? "sem tipo" });

  const sig = req.headers.get("x-signature");
  const reqId = req.headers.get("x-request-id");
  let env: PayEnv | null = null;
  for (const e of ["producao", "sandbox"] as PayEnv[]) {
    const secret = await gatewaySecret("mercado_pago", e, "webhook_secret");
    if (secret && mercadoPagoSignatureOk(secret, sig, reqId, dataId)) { env = e; break; }
  }
  if (!env) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  const { status, ref } = await mercadoPagoStatus(env, dataId);
  if (!ref?.startsWith(`${ROTTA_REF}:`)) return NextResponse.json({ ok: true, ignored: "outro produto" });
  if (status === "pendente") return NextResponse.json({ ok: true, pending: true });

  const { data, error } = await supabaseAnon().rpc("confirm_payment", {
    p_secret: process.env.INTERNAL_SECRET, p_provider: "mercado_pago", p_event: `payment.${status}`,
    p_external_id: `mp:${dataId}:${status}`, p_gateway_id: dataId, p_status: status, p_payload: body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
