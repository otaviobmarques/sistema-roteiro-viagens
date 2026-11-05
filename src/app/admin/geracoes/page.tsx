import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Pill } from "@/components/ui";
import { fmtBRL } from "@/lib/domain/settle";

const dt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function AdminGenerations() {
  const { supabase } = await requireUser();
  const [{ data: gens }, { data: orders }, { data: audit }] = await Promise.all([
    supabase.from("ai_generations").select("id, kind, status, input_tokens, output_tokens, cost_total_cents, duration_ms, error, score, created_at, profiles(name)").order("created_at", { ascending: false }).limit(50),
    supabase.from("orders").select("id, product_id, amount_cents, method, status, gateway, gateway_id, created_at, paid_at, profiles(name)").order("created_at", { ascending: false }).limit(50),
    supabase.from("audit_log").select("id, action, target, details, created_at, profiles(name)").order("created_at", { ascending: false }).limit(50),
  ]);
  const name = (p: unknown) => (Array.isArray(p) ? p[0]?.name : (p as { name?: string } | null)?.name) || "—";
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Backoffice" title="IA, pedidos e auditoria" />
      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-0 text-lg font-bold">Gerações de IA recentes</h2>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line text-left"><tr>{["Quando", "Usuário", "Tipo", "Status", "Tokens (entrada/saída)", "Custo", "Duração", "Score"].map((h) => <th key={h} className="label p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {(gens ?? []).map((g) => (
              <tr key={g.id}>
                <td className="mono p-3">{dt(g.created_at)}</td>
                <td className="p-3">{name(g.profiles)}</td>
                <td className="p-3">{g.kind}</td>
                <td className="p-3"><Pill tone={g.status === "concluida" ? "ok" : g.status === "falhou" ? "danger" : "warn"}>{g.status}</Pill>{g.error && <div className="mt-1 max-w-[220px] truncate text-xs text-danger" title={g.error}>{g.error}</div>}</td>
                <td className="mono p-3">{g.input_tokens ?? 0} / {g.output_tokens ?? 0}</td>
                <td className="mono p-3">{fmtBRL(Number(g.cost_total_cents || 0))}</td>
                <td className="mono p-3">{g.duration_ms ? `${(g.duration_ms / 1000).toFixed(1)} s` : "—"}</td>
                <td className="mono p-3">{g.score ?? "—"}</td>
              </tr>
            ))}
            {!gens?.length && <tr><td colSpan={8} className="p-6 text-center text-gray">Nenhuma geração ainda.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-0 text-lg font-bold">Pedidos</h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left"><tr>{["Quando", "Usuário", "Produto", "Valor", "Meio", "Status", "ID no gateway"].map((h) => <th key={h} className="label p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td className="mono p-3">{dt(o.created_at)}</td>
                <td className="p-3">{name(o.profiles)}</td>
                <td className="p-3">{o.product_id}</td>
                <td className="mono p-3">{fmtBRL(o.amount_cents)}</td>
                <td className="p-3">{o.method}</td>
                <td className="p-3"><Pill tone={o.status === "pago" ? "ok" : o.status === "pendente" ? "warn" : "neutral"}>{o.status}</Pill></td>
                <td className="mono p-3 text-xs">{o.gateway} · {o.gateway_id}</td>
              </tr>
            ))}
            {!orders?.length && <tr><td colSpan={7} className="p-6 text-center text-gray">Nenhum pedido ainda.</td></tr>}
          </tbody>
        </table>
        <p className="px-4 pb-4 text-xs text-gray">Estorno: faça no painel do Asaas; o webhook PAYMENT_REFUNDED remove os créditos automaticamente.</p>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-0 text-lg font-bold">Auditoria</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left"><tr>{["Quando", "Quem", "Ação", "Alvo", "Detalhes"].map((h) => <th key={h} className="label p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {(audit ?? []).map((a) => (
              <tr key={a.id}>
                <td className="mono p-3">{dt(a.created_at)}</td>
                <td className="p-3">{name(a.profiles)}</td>
                <td className="p-3">{a.action}</td>
                <td className="mono p-3 text-xs">{a.target?.slice(0, 8)}</td>
                <td className="mono p-3 text-xs">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
            {!audit?.length && <tr><td colSpan={5} className="p-6 text-center text-gray">Sem registros.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
