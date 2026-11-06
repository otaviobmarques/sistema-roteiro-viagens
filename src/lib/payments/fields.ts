// Campos de credencial por fornecedor (usado no servidor e no navegador)
type Env = "sandbox" | "producao";
type Cred = { provider: string; environment: Env; kind: string };

export const FIELDS: Record<string, { kind: string; label: string; hint: string; required?: boolean }[]> = {
  asaas: [
    { kind: "api_key", label: "Chave de API", hint: "$aact_hmlg_… (teste) ou $aact_prod_… (produção) · Integrações → Chaves de API", required: true },
    { kind: "webhook_token", label: "Token de autenticação do webhook", hint: "O mesmo token cadastrado no webhook do Asaas", required: true },
  ],
  mercado_pago: [
    { kind: "api_key", label: "Access token", hint: "TEST-… (teste) ou APP_USR-… (produção) · Suas integrações → Credenciais", required: true },
    { kind: "public_key", label: "Public key", hint: "Opcional neste MVP" },
    { kind: "webhook_secret", label: "Assinatura secreta do webhook", hint: "Suas integrações → Webhooks → Assinatura secreta", required: true },
  ],
  stripe: [
    { kind: "api_key", label: "Chave secreta", hint: "sk_test_… (teste) ou sk_live_… (produção) · Developers → API keys", required: true },
    { kind: "public_key", label: "Chave publicável", hint: "pk_test_… ou pk_live_… (opcional neste MVP)" },
    { kind: "webhook_secret", label: "Segredo de assinatura do webhook", hint: "whsec_… · Developers → Webhooks → endpoint", required: true },
  ],
};

export function readiness(creds: Cred[], provider: string, env: Env) {
  const req = FIELDS[provider].filter((f) => f.required).map((f) => f.kind);
  return req.every((k) => creds.some((c) => c.provider === provider && c.environment === env && c.kind === k));
}

