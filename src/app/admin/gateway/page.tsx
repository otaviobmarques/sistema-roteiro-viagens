import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Pill, Notice } from "@/components/ui";
import { GatewayEditor, SettingsEditor } from "@/components/admin/gateway-editor";
import { ModeSwitch, CredentialsEditor, ProviderSwitch } from "@/components/admin/payment-admin";
import { readiness } from "@/lib/payments/fields";
import { AffiliatesEditor } from "@/components/admin/affiliates-editor";

const PROVIDER: Record<string, string> = { asaas: "Asaas", mercado_pago: "Mercado Pago", stripe: "Stripe" };
const ABOUT: Record<string, string> = {
  asaas: "Pix brasileiro. Recomendado como principal.",
  mercado_pago: "Pix pelo Mercado Pago. Bom como reserva: se o principal falhar, a cobrança sai por aqui.",
  stripe: "Cartão de crédito, inclusive de fora do Brasil, pelo checkout da Stripe.",
};
const WEBHOOK_PATH: Record<string, string> = { asaas: "asaas", mercado_pago: "mercadopago", stripe: "stripe" };

type Env = "sandbox" | "producao";

export default async function AdminGateway() {
  const { supabase } = await requireUser();
  const [{ data: gateways }, { data: events }, { data: settings }, { data: creds }] = await Promise.all([
    supabase.from("payment_gateways").select("*").order("provider"),
    supabase.from("webhook_events").select("*").order("received_at", { ascending: false }).limit(20),
    supabase.from("app_settings").select("*"),
    supabase.rpc("admin_gateway_secrets"),
  ]);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://rotta365.vercel.app";
  const env = ((settings ?? []).find((s) => s.key === "payment_env")?.value as Env) ?? "sandbox";
  const credentials = (creds ?? []) as { provider: string; environment: Env; kind: string; last4: string; updated_at: string }[];
  const active = (gateways ?? []).filter((g) => g.active).map((g) => g.provider as string);

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Backoffice · tela 37" title="Gateway de pagamento" />

      <ModeSwitch env={env} creds={credentials} activeProviders={active} />

      {!process.env.INTERNAL_SECRET && <Notice tone="danger">Falta a variável INTERNAL_SECRET na Vercel: sem ela nenhum pagamento funciona.</Notice>}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Fornecedores</h2>
        <p className="text-sm text-gray">As chaves ficam no cofre criptografado do banco e nunca voltam para a tela: aparecem só os 4 últimos caracteres. Cada troca entra na auditoria.</p>
        <div className="grid gap-4 xl:grid-cols-3">
          {(gateways ?? []).map((g) => {
            const ready = readiness(credentials, g.provider, env);
            return (
              <div key={g.id} className="card space-y-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-bold">{PROVIDER[g.provider]}</div>
                    <p className="text-xs text-gray">{ABOUT[g.provider]}</p>
                  </div>
                  {g.active ? <Pill tone={ready ? "ok" : "warn"}>{ready ? "em uso" : "incompleto"}</Pill> : <Pill>desligado</Pill>}
                </div>
                <ProviderSwitch id={g.id} active={g.active} role={g.role} ready={ready} />
                <details className="rounded-xl border border-line p-3" open={!readiness(credentials, g.provider, "sandbox")}>
                  <summary className="cursor-pointer text-sm font-semibold">Credenciais e webhook</summary>
                  <div className="mt-3"><CredentialsEditor provider={g.provider} creds={credentials} webhookUrl={`${site}/api/webhooks/${WEBHOOK_PATH[g.provider]}`} /></div>
                </details>
                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Meios de pagamento e regras</summary>
                  <div className="mt-3"><GatewayEditor id={g.id} active={g.active} environment={g.environment} config={g.config ?? {}} editable /></div>
                </details>
              </div>
            );
          })}
        </div>
        <Notice tone="blue">Pix: usa o fornecedor <b>principal</b> e, se ele falhar, o de <b>reserva</b>. Cartão: usa a Stripe quando estiver ativa. 2FA para editar estas configurações chega na V1 (RF-185).</Notice>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-bold">Parceiros (afiliados)</h2>
        <p className="mb-3 text-sm text-gray">Seus links de afiliado de seguro viagem e eSIM. Eles aparecem no guia “Antes de ir” dos roteiros internacionais.</p>
        <AffiliatesEditor initial={((settings ?? []).find((s) => s.key === "affiliates")?.value ?? {}) as never} />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-lg font-bold">Configurações do app</h2>
        <SettingsEditor settings={(settings ?? []).filter((s) => s.key !== "payment_env" && s.key !== "affiliates").map((s) => ({ key: s.key, value: s.value }))} />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-lg font-bold">Últimos eventos de webhook</h2>
        {!events?.length ? <p className="text-sm text-gray">Nenhum evento recebido ainda.</p> : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <details className="rounded-xl border border-line p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="mono text-xs text-gray">{new Date(e.received_at).toLocaleString("pt-BR")}</span>
                    <Pill>{PROVIDER[e.provider] ?? e.provider}</Pill>
                    <b>{e.event}</b>
                    <Pill tone={e.status === "processado" ? "ok" : "danger"}>{e.status}</Pill>
                  </summary>
                  <pre className="mono mt-2 max-h-64 overflow-auto rounded-lg bg-ice p-2 text-[11px]">{JSON.stringify(e.payload, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray">Cada evento é processado uma vez só (idempotência pelo ID). Se o processamento falhar, o fornecedor reenvia sozinho.</p>
      </section>
    </div>
  );
}
