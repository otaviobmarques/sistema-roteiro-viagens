import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Pill, Notice } from "@/components/ui";
import { GatewayEditor, SettingsEditor, CopyField } from "@/components/admin/gateway-editor";

const ROLE: Record<string, string> = { principal: "Principal", reserva: "Reserva", internacional: "Internacional" };
const PROVIDER: Record<string, string> = { asaas: "Asaas", mercado_pago: "Mercado Pago", stripe: "Stripe" };

export default async function AdminGateway() {
  const { supabase } = await requireUser();
  const [{ data: gateways }, { data: events }, { data: settings }] = await Promise.all([
    supabase.from("payment_gateways").select("*").order("role"),
    supabase.from("webhook_events").select("*").order("received_at", { ascending: false }).limit(20),
    supabase.from("app_settings").select("*"),
  ]);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://SEU-DOMINIO";
  const asaasKey = !!process.env.ASAAS_API_KEY;
  const asaasToken = !!process.env.ASAAS_WEBHOOK_TOKEN;
  const internal = !!process.env.INTERNAL_SECRET;
  const env = process.env.ASAAS_ENV === "production" ? "Produção" : "Sandbox";
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Backoffice · tela 37" title="Gateway de pagamento" />

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-bold">Credenciais (cofre de segredos)</h2>
        <p className="text-sm text-gray">As chaves ficam nas variáveis de ambiente da Vercel, nunca no banco nem nesta tela.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["ASAAS_API_KEY", asaasKey], ["ASAAS_WEBHOOK_TOKEN", asaasToken], ["INTERNAL_SECRET", internal],
          ].map(([k, ok]) => (
            <div key={String(k)} className="rounded-xl border border-line p-3">
              <div className="mono text-xs">{String(k)}</div>
              <Pill tone={ok ? "ok" : "warn"}>{ok ? "configurada" : "não configurada"}</Pill>
            </div>
          ))}
          <div className="rounded-xl border border-line p-3"><div className="mono text-xs">ASAAS_ENV</div><Pill tone={env === "Produção" ? "blue" : "neutral"}>{env}</Pill></div>
        </div>
        <div>
          <div className="label mb-1">URL do webhook (cole no painel do Asaas, com o token acima)</div>
          <CopyField value={`${site}/api/webhooks/asaas`} />
        </div>
        <Notice tone="blue">Mudar de Sandbox para Produção: troque ASAAS_ENV e ASAAS_API_KEY na Vercel e faça um novo deploy. 2FA para editar e failover automático entre gateways (RF-188) chegam na V1.</Notice>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Provedores e meios de pagamento</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {(gateways ?? []).map((g) => (
            <div key={g.id} className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div><div className="label">{ROLE[g.role]}</div><div className="font-bold">{PROVIDER[g.provider]}</div></div>
                {g.provider === "asaas" ? <Pill tone={asaasKey ? "ok" : "warn"}>{asaasKey ? "integrado" : "sem chave"}</Pill> : <Pill>em breve</Pill>}
              </div>
              <GatewayEditor id={g.id} active={g.active} environment={g.environment} config={g.config ?? {}} editable={g.provider === "asaas"} />
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-lg font-bold">Configurações do app</h2>
        <SettingsEditor settings={(settings ?? []).map((s) => ({ key: s.key, value: s.value }))} />
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
                    <b>{e.event}</b>
                    <Pill tone={e.status === "processado" ? "ok" : "danger"}>{e.status}</Pill>
                    <span className="mono text-xs text-gray">{e.external_id}</span>
                  </summary>
                  <pre className="mono mt-2 max-h-64 overflow-auto rounded-lg bg-ice p-2 text-[11px]">{JSON.stringify(e.payload, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray">Cada evento é processado uma vez só (idempotência pelo ID). Se o processamento falhar, o Asaas reenvia sozinho.</p>
      </section>
    </div>
  );
}
