import { requireUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { UserActions } from "@/components/admin/user-actions";
import { CreateUser } from "@/components/admin/create-user";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireUser();
  let query = supabase.from("profiles").select("id, name, home_city, is_admin, suspended, created_at").order("created_at", { ascending: false }).limit(100);
  if (q?.trim()) query = query.ilike("name", `%${q.trim()}%`);
  const { data: users } = await query;
  const ids = (users ?? []).map((u) => u.id);
  const { data: wallets } = ids.length ? await supabase.from("credit_wallets").select("user_id, balance").in("user_id", ids) : { data: [] };
  const bal = new Map((wallets ?? []).map((w) => [w.user_id, w.balance]));
  const { data: logins } = ids.length ? await supabase.rpc("admin_user_logins", { p_ids: ids }) : { data: [] };
  const loginOf = new Map(((logins ?? []) as { id: string; login: string; last_sign_in_at: string | null }[]).map((l) => [l.id, l]));
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://rotta365.vercel.app";
  return (
    <div>
      <PageTitle eyebrow="Backoffice" title="Usuários" />
      <div className="mb-5"><CreateUser siteUrl={site} /></div>
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} className="input max-w-sm" placeholder="Buscar por nome" aria-label="Buscar por nome" />
        <button className="btn-secondary">Buscar</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left">
            <tr><th className="label p-3">Nome</th><th className="label p-3">Login</th><th className="label p-3">Desde</th><th className="label p-3">Créditos</th><th className="label p-3">Status</th><th className="label p-3">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="p-3 font-semibold">{u.name || "—"} {u.is_admin && <span className="ml-1 rounded bg-navy px-1.5 text-[10px] text-white">admin</span>}<div className="mono text-[11px] font-normal text-gray">{u.id.slice(0, 8)}</div></td>
                <td className="p-3"><span className="mono text-xs">{loginOf.get(u.id)?.login ?? "—"}</span><div className="text-[11px] text-gray">{loginOf.get(u.id)?.last_sign_in_at ? `último acesso ${new Date(loginOf.get(u.id)!.last_sign_in_at!).toLocaleDateString("pt-BR")}` : "nunca entrou"}</div></td>
                <td className="mono p-3">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="mono p-3">{bal.get(u.id) ?? 0}</td>
                <td className="p-3">{u.suspended ? <span className="font-semibold text-danger">Suspenso</span> : "Ativo"}</td>
                <td className="p-3"><UserActions userId={u.id} suspended={u.suspended} /></td>
              </tr>
            ))}
            {!users?.length && <tr><td colSpan={6} className="p-6 text-center text-gray">Nenhum usuário encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray">Toda ação fica registrada na auditoria. Impersonação e reembolso pelo gateway entram numa próxima etapa.</p>
    </div>
  );
}
