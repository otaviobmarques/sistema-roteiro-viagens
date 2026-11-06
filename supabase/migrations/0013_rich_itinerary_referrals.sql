-- Roteiro mais rico (fotos e "como chegar") + Indique e ganhe.

-- ---------- fotos e trajetos ----------
alter table public.itinerary_items
  add column if not exists photo_url text,
  add column if not exists photo_credit text,
  add column if not exists transit_tip text,
  add column if not exists transit_from text,
  add column if not exists transit_cost_cents bigint;
alter table public.places
  add column if not exists photo_url text,
  add column if not exists photo_credit text,
  add column if not exists photo_checked_at timestamptz;

-- ---------- indicação ----------
alter table public.profiles add column if not exists referral_code text;
update public.profiles set referral_code = substr(md5(id::text || clock_timestamp()::text), 1, 7) where referral_code is null;
alter table public.profiles alter column referral_code set default substr(md5(gen_random_uuid()::text), 1, 7);
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

create table if not exists public.referrals (
  referred_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
alter table public.referrals enable row level security;
create policy referrals_select on public.referrals for select using (referrer_id = auth.uid() or referred_id = auth.uid() or is_admin());

insert into public.app_settings (key, value) values ('referral_credits', '1') on conflict (key) do nothing;

-- quem chegou por um link de indicação registra o padrinho (só conta nova, sem compra, e não pode ser o próprio)
create or replace function public.claim_referral(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ref uuid;
begin
  if auth.uid() is null or p_code is null then return false; end if;
  select id into ref from profiles where referral_code = lower(trim(p_code));
  if ref is null or ref = auth.uid() then return false; end if;
  if exists (select 1 from referrals where referred_id = auth.uid()) then return false; end if;
  if exists (select 1 from orders where user_id = auth.uid() and status = 'pago') then return false; end if;
  if (select created_at from profiles where id = auth.uid()) < now() - interval '30 days' then return false; end if;
  insert into referrals (referred_id, referrer_id) values (auth.uid(), ref);
  return true;
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- recompensa: na primeira compra paga do indicado, os dois ganham crédito
create or replace function public.reward_referral(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r referrals; n int;
begin
  select * into r from referrals where referred_id = p_user and rewarded_at is null for update;
  if r is null then return; end if;
  if (select count(*) from orders where user_id = p_user and status = 'pago') <> 1 then return; end if;
  select coalesce((value)::text::int, 1) into n from app_settings where key = 'referral_credits';
  n := coalesce(n, 1);
  update referrals set rewarded_at = now() where referred_id = p_user;
  update credit_wallets set balance = balance + n, updated_at = now() where user_id in (r.referrer_id, r.referred_id);
  insert into credit_transactions (user_id, kind, amount, expires_at, note) values
    (r.referrer_id, 'bonus', n, now() + interval '12 months', 'Indicação: amigo fez a primeira compra'),
    (r.referred_id, 'bonus', n, now() + interval '12 months', 'Indicação: bônus de boas-vindas');
  insert into notifications (user_id, kind, title, body, link) values
    (r.referrer_id, 'indicacao', 'Sua indicação deu certo! 🎉', n || ' crédito(s) de presente na sua carteira', '/app/carteira'),
    (r.referred_id, 'indicacao', 'Presente de indicação 🎁', n || ' crédito(s) extra na sua carteira', '/app/carteira');
end $$;
revoke execute on function public.reward_referral(uuid) from public, anon, authenticated;

create or replace function public.confirm_payment(p_secret text, p_provider text, p_event text, p_external_id text, p_gateway_id text, p_status text, p_payload jsonb)
 returns text language plpgsql security definer set search_path to 'public', 'private' as $function$
declare o orders; prod products;
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  begin
    insert into webhook_events (provider, event, external_id, payload) values (p_provider, p_event, p_external_id, p_payload);
  exception when unique_violation then
    return 'duplicado';
  end;
  select * into o from orders where gateway_id = p_gateway_id for update;
  if o is null then
    update webhook_events set status = 'falhou' where external_id = p_external_id;
    return 'pedido não encontrado';
  end if;
  select * into prod from products where id = o.product_id;
  if p_status = 'pago' and o.status = 'pendente' then
    update orders set status = 'pago', paid_at = now() where id = o.id;
    update credit_wallets set balance = balance + prod.credits, updated_at = now() where user_id = o.user_id;
    insert into credit_transactions (user_id, kind, amount, order_id, expires_at, note)
      values (o.user_id, 'compra', prod.credits, o.id, now() + make_interval(months => prod.validity_months), prod.name);
    insert into notifications (user_id, kind, title, body, link)
      values (o.user_id, 'pagamento', 'Pagamento confirmado', prod.credits || ' crédito(s) na sua carteira', '/app/carteira');
    perform reward_referral(o.user_id);
  elsif p_status = 'estornado' and o.status = 'pago' then
    update orders set status = 'estornado' where id = o.id;
    update credit_wallets set balance = greatest(0, balance - prod.credits) where user_id = o.user_id;
    insert into credit_transactions (user_id, kind, amount, order_id, note) values (o.user_id, 'estorno', -prod.credits, o.id, 'Estorno');
  elsif p_status in ('expirado','falhou') and o.status = 'pendente' then
    update orders set status = p_status where id = o.id;
  end if;
  return 'ok';
end $function$;
