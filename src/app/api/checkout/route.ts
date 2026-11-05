import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Checkout pré-pago (M19/M24). O crédito só é liberado pelo webhook assinado do gateway (RF-181).
function asaasBase() {
  return process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(asaasBase() + path, {
    ...init,
    headers: { "Content-Type": "application/json", access_token: process.env.ASAAS_API_KEY!, "User-Agent": "Rotta365", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.errors?.[0]?.description || `Gateway respondeu ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Faça login para comprar." }, { status: 401 });

  if (!process.env.ASAAS_API_KEY || !process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Pagamentos ainda não configurados. Fale com o suporte ou tente mais tarde." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const productId = String(body.product || "");
  const cpf = String(body.cpf || "").replace(/\D/g, "");
  const { data: product } = await supabase.from("products").select("*").eq("id", productId).eq("active", true).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  if (cpf && cpf.length !== 11 && cpf.length !== 14) return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", auth.user.id).single();

  try {
    // cliente no Asaas: reutiliza pelo externalReference = id do usuário
    const found = await asaas(`/customers?externalReference=${auth.user.id}&limit=1`);
    let customerId: string | undefined = found?.data?.[0]?.id;
    if (!customerId) {
      const c = await asaas("/customers", {
        method: "POST",
        body: JSON.stringify({ name: profile?.name || auth.user.email, email: auth.user.email, externalReference: auth.user.id, ...(cpf ? { cpfCnpj: cpf } : {}) }),
      });
      customerId = c.id;
    } else if (cpf) {
      await asaas(`/customers/${customerId}`, { method: "PUT", body: JSON.stringify({ cpfCnpj: cpf }) }).catch(() => null);
    }

    const today = new Date().toISOString().slice(0, 10);
    const payment = await asaas("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        value: product.price_cents / 100,
        dueDate: today,
        description: `Rotta 365 · ${product.name}`,
        externalReference: `${auth.user.id}:${product.id}`,
      }),
    });
    const qr = await asaas(`/payments/${payment.id}/pixQrCode`);

    const { data: orderId, error } = await supabase.rpc("create_order_record", {
      p_secret: process.env.INTERNAL_SECRET,
      p_user: auth.user.id,
      p_product: product.id,
      p_method: "pix",
      p_gateway: "asaas",
      p_gateway_id: payment.id,
      p_pix_payload: qr.payload,
      p_qr: qr.encodedImage,
      p_url: payment.invoiceUrl ?? null,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ orderId, payload: qr.payload, image: qr.encodedImage, expiresAt: qr.expirationDate, invoiceUrl: payment.invoiceUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao criar a cobrança." }, { status: 502 });
  }
}
