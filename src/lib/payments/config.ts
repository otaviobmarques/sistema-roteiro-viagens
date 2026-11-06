// Configuração de pagamentos: modo (Teste/Produção) e credenciais vêm do banco (cofre do Supabase),
// editáveis no backoffice. Variáveis de ambiente antigas ficam só como reserva.
import { supabaseAnon } from "../supabase/server";

export type Provider = "asaas" | "mercado_pago" | "stripe";
export type PayEnv = "sandbox" | "producao";
export type SecretKind = "api_key" | "webhook_token" | "public_key" | "webhook_secret";
export type GatewayRow = { provider: Provider; role: "principal" | "reserva" | "internacional"; active: boolean; config: Record<string, unknown> };
export type PaymentConfig = { env: PayEnv; gateways: GatewayRow[]; credentials: { provider: Provider; environment: PayEnv; kind: SecretKind }[] };

export const PROVIDER_LABEL: Record<Provider, string> = { asaas: "Asaas", mercado_pago: "Mercado Pago", stripe: "Stripe" };
export const ROTTA_REF = "rotta365"; // prefixo nas cobranças: a conta do gateway pode ser compartilhada com outros produtos

let cache: { at: number; value: PaymentConfig } | null = null;

export async function paymentConfig(fresh = false): Promise<PaymentConfig> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  const { data, error } = await supabaseAnon().rpc("server_payment_config", { p_secret: process.env.INTERNAL_SECRET });
  if (error || !data) throw new Error("Configuração de pagamento indisponível.");
  const value = { env: (data.env === "producao" ? "producao" : "sandbox") as PayEnv, gateways: data.gateways ?? [], credentials: data.credentials ?? [] };
  cache = { at: Date.now(), value };
  return value;
}

const ENV_FALLBACK: Record<string, string | undefined> = {
  "asaas:sandbox:api_key": process.env.ASAAS_API_KEY_SANDBOX,
  "asaas:producao:api_key": process.env.ASAAS_API_KEY_PRODUCTION,
  "asaas:sandbox:webhook_token": process.env.ASAAS_WEBHOOK_TOKEN,
};

const secretCache = new Map<string, { at: number; v: string | null }>();

export async function gatewaySecret(provider: Provider, env: PayEnv, kind: SecretKind): Promise<string | null> {
  const k = `${provider}:${env}:${kind}`;
  const c = secretCache.get(k);
  if (c && Date.now() - c.at < 15_000) return c.v;
  const { data } = await supabaseAnon().rpc("server_gateway_secret", { p_secret: process.env.INTERNAL_SECRET, p_provider: provider, p_env: env, p_kind: kind });
  const v = (data as string | null) || ENV_FALLBACK[k] || null;
  secretCache.set(k, { at: Date.now(), v });
  return v;
}

export function hasCredential(cfg: PaymentConfig, provider: Provider, kind: SecretKind = "api_key") {
  return cfg.credentials.some((c) => c.provider === provider && c.environment === cfg.env && c.kind === kind);
}

/** Gateways de Pix na ordem de uso: principal e depois reserva (failover, RF-188). */
export function pixProviders(cfg: PaymentConfig): Provider[] {
  return cfg.gateways
    .filter((g) => g.active && (g.provider === "asaas" || g.provider === "mercado_pago") && g.config?.pix !== false && hasCredential(cfg, g.provider))
    .sort((a, b) => (a.role === "principal" ? -1 : b.role === "principal" ? 1 : 0))
    .map((g) => g.provider);
}

export function cardProvider(cfg: PaymentConfig): Provider | null {
  const s = cfg.gateways.find((g) => g.provider === "stripe" && g.active && hasCredential(cfg, "stripe"));
  return s ? "stripe" : null;
}
