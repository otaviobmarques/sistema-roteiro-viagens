-- Configuração de pagamento lida pelo servidor (modo, gateways ativos e quais credenciais existem)
create or replace function public.server_payment_config(p_secret text) returns json
language plpgsql stable security definer set search_path = public, private as $$
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  return json_build_object(
    'env', (select value #>> '{}' from app_settings where key = 'payment_env'),
    'gateways', (select coalesce(json_agg(json_build_object('provider', provider, 'role', role, 'active', active, 'config', config)), '[]') from payment_gateways),
    'credentials', (select coalesce(json_agg(json_build_object('provider', provider, 'environment', environment, 'kind', kind)), '[]') from private.gateway_secret_meta)
  );
end $$;
