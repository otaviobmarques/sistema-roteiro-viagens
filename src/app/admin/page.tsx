import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Stat, Notice } from "@/components/ui";
import { fmtBRL } from "@/lib/domain/settle";
import { aiConfigured, AI_MODEL } from "@/lib/ai/claude";

type Metrics = {
  users: number; users_7d: number; trips: number; generated: number; activated: number; revenue_cents: number; orders_paid: number;
  ai_cost_cents: number; avg_full_cost_cents: number; avg_viability: number; generations: number; generations_failed: number;
};

export default async function AdminHome() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("admin_metrics");
  const m = (data ?? {}) as Metrics;
  const activation = m.users ? Math.round((m.activated / m.users) * 100) : 0;
  const avgTicket = m.orders_paid ? m.revenue_cents / m.orders_paid : 0;
  // Margem estimada (seção 16.3): receita − 15% de taxas e impostos − custo real de IA.
  const margin = m.revenue_cents * 0.85 - Number(m.ai_cost_cents || 0);
  const failRate = m.generations ? Math.round((m.generations_failed / m.generations) * 100) : 0;
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Backoffice" title="Métricas do Rotta 365" />
      {error && <Notice tone="danger">Erro ao carregar métricas: {error.message}</Notice>}
      {!aiConfigured() && <Notice tone="warn">IA não configurada: defina ANTHROPIC_API_KEY na Vercel. Modelo atual: {AI_MODEL}.</Notice>}
      <section>
        <h2 className="label mb-2">Crescimento</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Cadastros" value={m.users ?? 0} hint={`+${m.users_7d ?? 0} em 7 dias`} />
          <Stat label="Viagens criadas" value={m.trips ?? 0} />
          <Stat label="Roteiros completos" value={m.generated ?? 0} />
          <Stat label="Ativação" value={`${activation}%`} hint="gerou ao menos 1 roteiro" />
        </div>
      </section>
      <section>
        <h2 className="label mb-2">Receita e custo</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Receita confirmada" value={fmtBRL(m.revenue_cents)} hint={`${m.orders_paid ?? 0} pedidos pagos`} />
          <Stat label="Ticket médio" value={fmtBRL(avgTicket)} />
          <Stat label="Custo de IA (total)" value={fmtBRL(Number(m.ai_cost_cents || 0))} />
          <Stat label="Custo médio por roteiro" value={fmtBRL(Number(m.avg_full_cost_cents || 0))} hint="meta: abaixo de R$ 11" />
          <Stat label="Margem estimada" value={fmtBRL(margin)} hint="receita − 15% taxas − IA" />
          <Stat label="Viabilidade média" value={Math.round(Number(m.avg_viability || 0))} hint="score 0 a 100" />
          <Stat label="Gerações de IA" value={m.generations ?? 0} />
          <Stat label="Falhas de geração" value={`${m.generations_failed ?? 0}`} hint={`${failRate}% do total`} />
        </div>
      </section>
      <p className="text-xs text-gray">O custo de IA vem de cada chamada registrada (RF-236). Lugares vêm da base própria (OpenStreetMap/Wikidata), sem custo por consulta.</p>
    </div>
  );
}
