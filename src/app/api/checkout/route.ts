import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { paymentConfig, pixProviders, cardProvider, PROVIDER_LABEL, type Provider } from "@/lib/payments/config";
import { asaasPix, mercadoPagoPix, stripeCheckout, type Charge, type ChargeInput } from "@/lib/payments/providers";

export const maxDuration = 60;

/**
 * Checkout pré-pago (M19/M24). Pix pelo gateway principal com failover para o de reserva (RF-188);
 * cartão pela Stripe. O crédito só é liberado pelo webhook verificado do gateway (RF-181).
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Faça login para comprar." }, { status: 401 });
  if (!process.env.INTERNAL_SECRET) return NextResponse.json({ error: "Pagamentos ainda não configurados." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const productId = String(body.product || "");
  const method = body.method === "cartao" ? "cartao" : "pix";
  const cpf = String(body.cpf || "").replace(/\D/g, "");
  if (cpf && cpf.length !== 11 && cpf.length !== 14) return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });
  const { data: product } = await supabase.from("products").select("*").eq("id", productId).eq("active", true).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  const { data: profile } = await supabase.from("profiles").select("name").eq("id", auth.user.id).single();

  const cfg = await paymentConfig(true).catch(() => null);
  if (!cfg) return NextResponse.json({ error: "Pagamentos indisponíveis no momento." }, { status: 503 });
  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const input: ChargeInput = { userId: auth.user.id, email: auth.user.email!, name: profile?.name || auth.user.email!, cpf: cpf || undefined, productId: product.id, productName: product.name, amountCents: product.price_cents, siteUrl: site };

  const chain: Provider[] = method === "cartao" ? [cardProvider(cfg)].filter(Boolean) as Provider[] : pixProviders(cfg);
  if (!chain.length) {
    return NextResponse.json({ error: method === "cartao" ? "Pagamento com cartão ainda não está disponível." : "Pagamentos ainda não configurados. Fale com o suporte ou tente mais tarde." }, { status: 503 });
  }

  const errors: string[] = [];
  for (const provider of chain) {
    try {
      let charge: Charge;
      if (provider === "asaas") charge = await asaasPix(cfg.env, input);
      else if (provider === "mercado_pago") charge = await mercadoPagoPix(cfg.env, input);
      else charge = await stripeCheckout(cfg.env, { ...input, orderRef: `${auth.user.id}:${product.id}` });

      const { data: orderId, error } = await supabase.rpc("create_order_record", {
        p_secret: process.env.INTERNAL_SECRET,
        p_user: auth.user.id,
        p_product: product.id,
        p_method: method,
        p_gateway: cfg.env === "sandbox" ? `${provider}:teste` : provider,
        p_gateway_id: charge.gatewayId,
        p_pix_payload: charge.pixPayload ?? null,
        p_qr: charge.qrBase64 ?? null,
        p_url: charge.url ?? null,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({
        orderId, provider: PROVIDER_LABEL[provider], testMode: cfg.env === "sandbox",
        payload: charge.pixPayload ?? null, image: charge.qrBase64 ?? null, expiresAt: charge.expiresAt ?? null,
        invoiceUrl: provider === "stripe" ? null : charge.url ?? null, redirect: provider === "stripe" ? charge.url : null,
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e)); // tenta o próximo gateway
    }
  }
  return NextResponse.json({ error: `Não foi possível criar a cobrança. ${errors.join(" · ")}` }, { status: 502 });
}
