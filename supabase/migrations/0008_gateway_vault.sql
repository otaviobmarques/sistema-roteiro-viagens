-- Credenciais dos gateways no cofre (Supabase Vault), por provedor e ambiente (RF-185/186).
-- O valor nunca volta para o navegador: o backoffice vê só os 4 últimos caracteres.
insert into public.app_settings (key, value) values ('payment_env', '"sandbox"') on conflict (key) do nothing;

create table private.gateway_secret_meta (
  provider text not null check (provider in ('asaas','mercado_pago','stripe')),
  environment text not null check (environment in ('sandbox','producao')),
  kind text not null check (kind in ('api_key','webhook_token','public_key','webhook_secret')),
  vault_id uuid not null,
  last4 text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (provider, environment, kind)
);

create or replace function public.admin_set_gateway_secret(p_provider text, p_env text, p_kind text, p_value text) returns void
language plpgsql security definer set search_path = public, private, vault as $$
declare m private.gateway_secret_meta; vid uuid; nm text := 'gw:' || p_provider || ':' || p_env || ':' || p_kind;
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  if p_value is null or length(trim(p_value)) < 8 then raise exception 'valor inválido'; end if;
  select * into m from private.gateway_secret_meta where provider = p_provider and environment = p_env and kind = p_kind;
  if m.vault_id is not null then
    perform vault.update_secret(m.vault_id, trim(p_value), nm);
    vid := m.vault_id;
  else
    vid := vault.create_secret(trim(p_value), nm, 'Credencial de gateway Rotta 365');
  end if;
  insert into private.gateway_secret_meta (provider, environment, kind, vault_id, last4, updated_by, updated_at)
  values (p_provider, p_env, p_kind, vid, right(trim(p_value), 4), auth.uid(), now())
  on conflict (provider, environment, kind) do update set vault_id = excluded.vault_id, last4 = excluded.last4, updated_by = excluded.updated_by, updated_at = now();
  insert into audit_log (actor_id, action, target, details) values (auth.uid(), 'gateway_credencial', p_provider, json_build_object('ambiente', p_env, 'tipo', p_kind, 'final', right(trim(p_value), 4)));
end $$;

create or replace function public.admin_gateway_secrets() returns table (provider text, environment text, kind text, last4 text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  return query select m.provider, m.environment, m.kind, m.last4, m.updated_at from private.gateway_secret_meta m order by 1, 2, 3;
end $$;

create or replace function public.admin_set_payment_env(p_env text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  if p_env not in ('sandbox','producao') then raise exception 'ambiente inválido'; end if;
  update app_settings set value = to_jsonb(p_env) where key = 'payment_env';
  update payment_gateways set environment = p_env, updated_by = auth.uid(), updated_at = now() where environment is distinct from p_env;
  insert into audit_log (actor_id, action, target, details) values (auth.uid(), 'modo_pagamento', p_env, null);
end $$;

-- Uso exclusivo do servidor (protegido pelo segredo interno): devolve a credencial decifrada
create or replace function public.server_gateway_secret(p_secret text, p_provider text, p_env text, p_kind text) returns text
language plpgsql stable security definer set search_path = public, private, vault as $$
declare v text;
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  select ds.decrypted_secret into v from private.gateway_secret_meta m join vault.decrypted_secrets ds on ds.id = m.vault_id
   where m.provider = p_provider and m.environment = p_env and m.kind = p_kind;
  return v;
end $$;

revoke execute on function public.admin_set_gateway_secret(text,text,text,text) from public, anon;
revoke execute on function public.admin_gateway_secrets() from public, anon;
revoke execute on function public.admin_set_payment_env(text) from public, anon;
grant execute on function public.admin_set_gateway_secret(text,text,text,text), public.admin_gateway_secrets(), public.admin_set_payment_env(text) to authenticated;
