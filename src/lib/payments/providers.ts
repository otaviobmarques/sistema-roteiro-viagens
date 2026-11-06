// Integração direta (HTTP) com Asaas, Mercado Pago e Stripe.
import crypto from "node:crypto";
import { gatewaySecret, ROTTA_REF, type PayEnv } from "./config";

export type Charge = { gatewayId: string; pixPayload?: string | null; qrBase64?: string | null; url?: string | null; expiresAt?: string | null };
export type ChargeInput = { userId: string; email: string; name: string; cpf?: string; productId: string; productName: string; amountCents: number; siteUrl: string };

async function http(url: string, init: RequestInit, label: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.errors?.[0]?.description || body?.message || body?.error?.message || body?.cause?.[0]?.description || `${label} respondeu ${res.status}`;
    throw new Error(`${label}: ${msg}`);
  }
  return body;
}

// ---------- Asaas ----------
export async function asaasPix(env: PayEnv, i: ChargeInput): Promise<Charge> {
  const key = await gatewaySecret("asaas", env, "api_key");
  if (!key) throw new Error("Asaas sem chave para este ambiente");
  const base = env === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const call = (path: string, init: RequestInit = {}) => http(base + path, { ...init, headers: { "Content-Type": "application/json", access_token: key, "User-Agent": "Rotta365" } }, "Asaas");
  const customerRef = `${ROTTA_REF}:${i.userId}`;
  const found = await call(`/customers?externalReference=${encodeURIComponent(customerRef)}&limit=1`);
  let customer: string | undefined = found?.data?.[0]?.id;
  if (!customer) {
    const c = await call("/customers", { method: "POST", body: JSON.stringify({ name: i.name, email: i.email, externalReference: customerRef, ...(i.cpf ? { cpfCnpj: i.cpf } : {}) }) });
    customer = c.id;
  } else if (i.cpf) {
    await call(`/customers/${customer}`, { method: "PUT", body: JSON.stringify({ cpfCnpj: i.cpf }) }).catch(() => null);
  }
  const p = await call("/payments", {
    method: "POST",
    body: JSON.stringify({ customer, billingType: "PIX", value: i.amountCents / 100, dueDate: new Date().toISOString().slice(0, 10), description: `Rotta 365 · ${i.productName}`, externalReference: `${ROTTA_REF}:${i.userId}:${i.productId}` }),
  });
  const qr = await call(`/payments/${p.id}/pixQrCode`);
  return { gatewayId: p.id, pixPayload: qr.payload, qrBase64: qr.encodedImage, url: p.invoiceUrl, expiresAt: qr.expirationDate };
}

/** Consulta a cobrança na API do Asaas (não confiamos só no corpo do webhook). */
export async function asaasPaymentStatus(env: PayEnv, paymentId: string): Promise<{ status: string; ref: string | null; valueCents: number }> {
  const key = await gatewaySecret("asaas", env, "api_key");
  if (!key) throw new Error("sem chave");
  const base = env === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const p = await http(`${base}/payments/${paymentId}`, { headers: { access_token: key, "User-Agent": "Rotta365" } }, "Asaas");
  const map: Record<string, string> = { RECEIVED: "pago", CONFIRMED: "pago", RECEIVED_IN_CASH: "pago", REFUNDED: "estornado", OVERDUE: "expirado" };
  return { status: map[p.status] ?? "pendente", ref: p.externalReference ?? null, valueCents: Math.round(Number(p.value) * 100) };
}

// ---------- Mercado Pago ----------
export async function mercadoPagoPix(env: PayEnv, i: ChargeInput): Promise<Charge> {
  const token = await gatewaySecret("mercado_pago", env, "api_key");
  if (!token) throw new Error("Mercado Pago sem access token para este ambiente");
  const [first, ...rest] = (i.name || "Viajante").split(" ");
  const p = await http("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      transaction_amount: i.amountCents / 100,
      description: `Rotta 365 · ${i.productName}`,
      payment_method_id: "pix",
      external_reference: `${ROTTA_REF}:${i.userId}:${i.productId}`,
      notification_url: `${i.siteUrl}/api/webhooks/mercadopago`,
      date_of_expiration: new Date(Date.now() + 30 * 60000).toISOString().replace("Z", "-00:00"),
      payer: { email: i.email, first_name: first, last_name: rest.join(" ") || first, ...(i.cpf ? { identification: { type: i.cpf.length === 14 ? "CNPJ" : "CPF", number: i.cpf } } : {}) },
    }),
  }, "Mercado Pago");
  const t = p.point_of_interaction?.transaction_data ?? {};
  return { gatewayId: String(p.id), pixPayload: t.qr_code, qrBase64: t.qr_code_base64, url: t.ticket_url, expiresAt: p.date_of_expiration };
}

export async function mercadoPagoStatus(env: PayEnv, paymentId: string): Promise<{ status: string; ref: string | null }> {
  const token = await gatewaySecret("mercado_pago", env, "api_key");
  if (!token) throw new Error("sem token");
  const p = await http(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } }, "Mercado Pago");
  const map: Record<string, string> = { approved: "pago", refunded: "estornado", charged_back: "estornado", cancelled: "expirado", rejected: "falhou" };
  return { status: map[p.status] ?? "pendente", ref: p.external_reference ?? null };
}

/** Assinatura x-signature do Mercado Pago: HMAC-SHA256 de "id:{data.id};request-id:{x-request-id};ts:{ts};" */
export function mercadoPagoSignatureOk(secret: string, header: string | null, requestId: string | null, dataId: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ""};ts:${parts.ts};`;
  const h = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqual(h, parts.v1);
}

// ---------- Stripe (cartão, inclusive internacional) ----------
export async function stripeCheckout(env: PayEnv, i: ChargeInput & { orderRef: string }): Promise<Charge> {
  const key = await gatewaySecret("stripe", env, "api_key");
  if (!key) throw new Error("Stripe sem chave secreta para este ambiente");
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "brl",
    "line_items[0][price_data][unit_amount]": String(i.amountCents),
    "line_items[0][price_data][product_data][name]": `Rotta 365 · ${i.productName}`,
    customer_email: i.email,
    client_reference_id: `${ROTTA_REF}:${i.userId}:${i.productId}`,
    "metadata[rotta]": i.orderRef,
    success_url: `${i.siteUrl}/app/carteira?pagamento=ok`,
    cancel_url: `${i.siteUrl}/app/carteira?pagamento=cancelado`,
    locale: "pt-BR",
  });
  const s = await http("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form }, "Stripe");
  return { gatewayId: s.id, url: s.url };
}

export async function stripeSessionForPaymentIntent(env: PayEnv, pi: string): Promise<string | null> {
  const key = await gatewaySecret("stripe", env, "api_key");
  if (!key) return null;
  const r = await http(`https://api.stripe.com/v1/checkout/sessions?payment_intent=${pi}&limit=1`, { headers: { Authorization: `Bearer ${key}` } }, "Stripe");
  return r.data?.[0]?.id ?? null;
}

/** Stripe-Signature: t=timestamp,v1=HMAC-SHA256("{t}.{corpo bruto}") com tolerância de 5 minutos. */
export function stripeSignatureOk(secret: string, header: string | null, raw: string) {
  if (!header) return false;
  const items = header.split(",").map((p) => p.split("="));
  const t = items.find(([k]) => k === "t")?.[1];
  const sigs = items.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const h = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some((s) => safeEqual(h, s));
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
