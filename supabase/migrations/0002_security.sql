-- Rotta 365 · RLS, gatilhos e funções de servidor
create schema if not exists private;

create table private.secrets (key text primary key, value text not null);

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create or replace function public.trip_role(t uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from trip_members where trip_id = t and user_id = auth.uid()
$$;

create or replace function public.is_trip_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from trip_members where trip_id = t and user_id = auth.uid())
$$;

create or replace function public.can_edit_trip(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from trip_members where trip_id = t and user_id = auth.uid() and role in ('organizador','editor'))
$$;

-- RN-07: visualizadores não veem gastos, a menos que o organizador libere
create or replace function public.can_see_expenses(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from trip_members where trip_id = t and user_id = auth.uid()
    and (role = 'organizador' or can_see_expenses))
$$;

-- ---------- novo usuário: perfil + carteira + bônus de boas-vindas ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare bonus int;
begin
  insert into profiles (id, name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url');
  select coalesce((value)::text::int, 0) into bonus from app_settings where key = 'welcome_credits';
  insert into credit_wallets (user_id, balance) values (new.id, coalesce(bonus,0));
  if coalesce(bonus,0) > 0 then
    insert into credit_transactions (user_id, kind, amount, expires_at, note)
    values (new.id, 'bonus', bonus, now() + interval '12 months', 'Boas-vindas');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- nova viagem: dono vira organizador (RN-01) ----------
create or replace function public.handle_new_trip() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into trip_members (trip_id, user_id, role) values (new.id, new.owner_id, 'organizador');
  insert into trip_preferences (trip_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_trip_created after insert on public.trips
  for each row execute function public.handle_new_trip();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger items_touch before update on public.itinerary_items for each row execute function public.touch_updated_at();

-- ---------- convite por link (RF-080) ----------
create or replace function public.join_trip(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv trip_invites;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  select * into inv from trip_invites where token = p_token;
  if inv is null or inv.expires_at < now() then raise exception 'convite inválido ou expirado'; end if;
  insert into trip_members (trip_id, user_id, role, invited_by, can_see_expenses)
  values (inv.trip_id, auth.uid(), inv.role, inv.created_by, inv.role <> 'visualizador')
  on conflict (trip_id, user_id) do nothing;
  update trip_invites set uses = uses + 1 where token = p_token;
  insert into activity_log (trip_id, user_id, action) values (inv.trip_id, auth.uid(), 'entrou na viagem');
  return inv.trip_id;
end $$;

create or replace function public.invite_preview(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('title', t.title, 'start_date', t.start_date, 'end_date', t.end_date,
    'owner', p.name, 'role', i.role, 'valid', i.expires_at > now())
  from trip_invites i join trips t on t.id = i.trip_id join profiles p on p.id = t.owner_id
  where i.token = p_token
$$;

-- ---------- créditos (M24) ----------
-- RN-16/17/18: debita 1 crédito só quando a geração termina com sucesso; ajustes da mesma viagem não consomem.
create or replace function public.consume_credit(p_trip uuid, p_generation uuid) returns int
language plpgsql security definer set search_path = public as $$
declare bal int; tx uuid;
begin
  if not exists (select 1 from trips where id = p_trip and owner_id = auth.uid()) then
    raise exception 'só o organizador pode gerar o roteiro completo';
  end if;
  if exists (select 1 from trips where id = p_trip and generated) then
    return (select balance from credit_wallets where user_id = auth.uid());
  end if;
  select balance into bal from credit_wallets where user_id = auth.uid() for update;
  if coalesce(bal,0) < 1 then raise exception 'sem créditos'; end if;
  update credit_wallets set balance = balance - 1, updated_at = now() where user_id = auth.uid();
  insert into credit_transactions (user_id, kind, amount, trip_id, note)
    values (auth.uid(), 'consumo', -1, p_trip, 'Roteiro completo') returning id into tx;
  perform set_config('rotta.trusted', 'on', true);
  update trips set generated = true where id = p_trip;
  perform set_config('rotta.trusted', 'off', true);
  update ai_generations set credit_transaction_id = tx where id = p_generation and user_id = auth.uid();
  return bal - 1;
end $$;

create or replace function public.has_credit_for(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from trips where id = p_trip and generated)
      or coalesce((select balance from credit_wallets where user_id = auth.uid()),0) >= 1
$$;

-- Transferir créditos a membro da mesma viagem (RN-19)
create or replace function public.transfer_credits(p_to uuid, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_amount < 1 then raise exception 'quantidade inválida'; end if;
  if not exists (select 1 from trip_members a join trip_members b on a.trip_id = b.trip_id
                 where a.user_id = auth.uid() and b.user_id = p_to) then
    raise exception 'só para pessoas da mesma viagem';
  end if;
  update credit_wallets set balance = balance - p_amount where user_id = auth.uid() and balance >= p_amount;
  if not found then raise exception 'saldo insuficiente'; end if;
  update credit_wallets set balance = balance + p_amount where user_id = p_to;
  insert into credit_transactions (user_id, kind, amount, note) values
    (auth.uid(), 'transferencia', -p_amount, 'Enviado'), (p_to, 'transferencia', p_amount, 'Recebido');
end $$;

-- Confirmação de pagamento: chamada SOMENTE pelo webhook do servidor, protegida por segredo interno (RF-181, idempotente RF-186)
create or replace function public.confirm_payment(p_secret text, p_provider text, p_event text, p_external_id text,
  p_gateway_id text, p_status text, p_payload jsonb) returns text
language plpgsql security definer set search_path = public, private as $$
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
  elsif p_status = 'estornado' and o.status = 'pago' then
    update orders set status = 'estornado' where id = o.id;
    update credit_wallets set balance = greatest(0, balance - prod.credits) where user_id = o.user_id;
    insert into credit_transactions (user_id, kind, amount, order_id, note) values (o.user_id, 'estorno', -prod.credits, o.id, 'Estorno');
  elsif p_status in ('expirado','falhou') and o.status = 'pendente' then
    update orders set status = p_status where id = o.id;
  end if;
  return 'ok';
end $$;

-- Pedido criado pelo servidor depois de abrir a cobrança no gateway (o cliente nunca grava pedidos)
create or replace function public.create_order_record(p_secret text, p_user uuid, p_product text, p_method text, p_gateway text,
  p_gateway_id text, p_pix_payload text, p_qr text, p_url text) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare oid uuid; price bigint;
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  select price_cents into price from products where id = p_product and active;
  if price is null then raise exception 'produto inválido'; end if;
  insert into orders (user_id, product_id, amount_cents, method, gateway, gateway_id, pix_payload, pix_qr_base64, invoice_url)
  values (p_user, p_product, price, p_method, p_gateway, p_gateway_id, p_pix_payload, p_qr, p_url) returning id into oid;
  return oid;
end $$;

-- Backoffice: conceder créditos (com auditoria, RF-174)
create or replace function public.admin_grant_credits(p_user uuid, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  update credit_wallets set balance = greatest(0, balance + p_amount), updated_at = now() where user_id = p_user;
  insert into credit_transactions (user_id, kind, amount, expires_at, note)
    values (p_user, case when p_amount >= 0 then 'bonus' else 'estorno' end, p_amount, now() + interval '12 months', coalesce(p_note,'Backoffice'));
  insert into audit_log (actor_id, action, target, details) values (auth.uid(), 'conceder_creditos', p_user::text, json_build_object('amount', p_amount, 'note', p_note));
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  update profiles set suspended = p_value where id = p_user;
  insert into audit_log (actor_id, action, target, details) values (auth.uid(), 'suspender', p_user::text, json_build_object('value', p_value));
end $$;

create or replace function public.admin_metrics() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  return json_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'trips', (select count(*) from trips),
    'generated', (select count(*) from trips where generated),
    'activated', (select count(distinct owner_id) from trips where generated),
    'revenue_cents', (select coalesce(sum(amount_cents),0) from orders where status = 'pago'),
    'orders_paid', (select count(*) from orders where status = 'pago'),
    'ai_cost_cents', (select coalesce(sum(cost_total_cents),0) from ai_generations),
    'avg_full_cost_cents', (select coalesce(avg(cost_total_cents),0) from ai_generations where kind = 'completa' and status = 'concluida'),
    'avg_viability', (select coalesce(avg(viability_score),0) from trips where viability_score is not null),
    'generations', (select count(*) from ai_generations),
    'generations_failed', (select count(*) from ai_generations where status = 'falhou')
  );
end $$;

-- Limite da prévia grátis (16.1: 3 por dia)
create or replace function public.previews_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((select (value)::text::int from app_settings where key='free_previews_per_day'),3)
    - (select count(*)::int from ai_generations where user_id = auth.uid() and kind in ('previa','descoberta') and created_at > now() - interval '24 hours'))
$$;

-- ---------- página pública (RF-120, RN-09: remove gastos, reservas e pessoas) ----------
create or replace function public.get_public_trip(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', t.id, 'title', t.title, 'start_date', t.start_date, 'end_date', t.end_date, 'emoji', t.emoji,
    'cover_color', t.cover_color, 'viability_score', t.viability_score,
    'hide_costs', t.public_hide_costs,
    'destinations', (select coalesce(json_agg(json_build_object('city', d.city, 'country', d.country, 'lat', d.lat, 'lng', d.lng, 'days', d.days) order by d.position), '[]') from trip_destinations d where d.trip_id = t.id),
    'days', (select coalesce(json_agg(json_build_object('id', dy.id, 'date', dy.date, 'title', dy.title, 'position', dy.position,
        'items', (select coalesce(json_agg(json_build_object('title', i.title, 'kind', i.kind, 'start_time', i.start_time, 'duration_min', i.duration_min,
            'lat', i.lat, 'lng', i.lng, 'category', i.category, 'why', i.why, 'score', i.score,
            'cost_cents', case when t.public_hide_costs then null else i.cost_cents end) order by i.position), '[]')
          from itinerary_items i where i.day_id = dy.id)) order by dy.position), '[]') from days dy where dy.trip_id = t.id)
  ) from trips t where t.slug = p_slug and t.is_public
$$;

-- Copiar roteiro público ou próprio (RF-120 "copiar este roteiro", RF-010 duplicar)
create or replace function public.copy_trip(p_trip uuid, p_start date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare src trips; new_id uuid; d record; new_day uuid; delta int := 0; dest_map jsonb := '{}'; nd uuid; r record;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  select * into src from trips where id = p_trip;
  if src is null or not (src.is_public or is_trip_member(p_trip)) then raise exception 'roteiro não encontrado'; end if;
  if p_start is not null and src.start_date is not null then delta := p_start - src.start_date; end if;
  insert into trips (owner_id, title, cover_color, emoji, status, start_date, end_date, currency, pace, travelers_adults, travelers_children)
  values (auth.uid(), src.title || case when src.owner_id = auth.uid() then ' (cópia)' else '' end, src.cover_color, src.emoji, 'planejando',
          src.start_date + delta, src.end_date + delta, src.currency, src.pace, src.travelers_adults, src.travelers_children)
  returning id into new_id;
  update trip_preferences tp set travel_profile = s.travel_profile, interests = s.interests, occasion = s.occasion
    from trip_preferences s where s.trip_id = p_trip and tp.trip_id = new_id;
  for r in select * from trip_destinations where trip_id = p_trip order by position loop
    insert into trip_destinations (trip_id, city, country, lat, lng, start_date, end_date, days, locked, position)
    values (new_id, r.city, r.country, r.lat, r.lng, r.start_date + delta, r.end_date + delta, r.days, r.locked, r.position) returning id into nd;
    dest_map := dest_map || jsonb_build_object(r.id::text, nd::text);
  end loop;
  for d in select * from days where trip_id = p_trip order by position loop
    insert into days (trip_id, destination_id, date, title, notes, day_start, position)
    values (new_id, (dest_map->>(d.destination_id::text))::uuid, d.date + delta, d.title, d.notes, d.day_start, d.position) returning id into new_day;
    insert into itinerary_items (trip_id, day_id, kind, title, place_id, lat, lng, category, interest_category, start_time, duration_min,
      anchor, anchor_time, transport_mode, travel_min, cost_cents, currency, opening_hours, outdoor, travel_profile, score, why, verified, position, created_by)
    select new_id, new_day, kind, title, place_id, lat, lng, category, interest_category, start_time, duration_min,
      false, null, transport_mode, travel_min, cost_cents, currency, opening_hours, outdoor, travel_profile, score, why, verified, position, auth.uid()
    from itinerary_items where day_id = d.id;
  end loop;
  return new_id;
end $$;

-- (Excluir conta, RF-005: feito por rota de servidor numa próxima etapa)

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['profiles','user_interests','trips','trip_members','trip_invites','trip_destinations','trip_preferences',
    'trip_must_haves','places','place_own_quality','place_reports','saved_places','days','itinerary_items','item_options','item_changes',
    'reservations','reservation_segments','files','expenses','expense_payers','expense_shares','settlements','polls','poll_options',
    'poll_votes','messages','activity_log','checklist_items','ai_generations','products','credit_wallets','credit_transactions','orders',
    'payment_gateways','webhook_events','app_settings','notifications','audit_log','marketplace_listings']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- perfis: dono lê/edita; membros da mesma viagem leem; admin lê todos
create policy profiles_self on public.profiles for select using (
  id = auth.uid() or is_admin() or exists (select 1 from trip_members a join trip_members b on a.trip_id = b.trip_id where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- impede usuário de se promover a admin ou se reativar
create or replace function public.protect_profile_flags() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.is_admin := old.is_admin; new.suspended := old.suspended;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_flags();

-- campos de viagem que só o servidor/funções alteram (crédito consumido, dono)
create or replace function public.protect_trip_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.generated is distinct from old.generated or new.adjustments_used is distinct from old.adjustments_used then
      if coalesce(current_setting('rotta.trusted', true), '') <> 'on' then
        new.generated := old.generated; new.adjustments_used := old.adjustments_used;
      end if;
    end if;
    if new.owner_id is distinct from old.owner_id then
      if old.owner_id <> auth.uid() or not exists (select 1 from trip_members where trip_id = new.id and user_id = new.owner_id) then
        new.owner_id := old.owner_id;
      else
        update trip_members set role = 'editor' where trip_id = new.id and user_id = old.owner_id;
        update trip_members set role = 'organizador' where trip_id = new.id and user_id = new.owner_id;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trips_protect before update on public.trips for each row execute function public.protect_trip_fields();

create policy interests_own on public.user_interests for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- viagens
create policy trips_select on public.trips for select using (is_trip_member(id) or is_admin());
create policy trips_insert on public.trips for insert with check (owner_id = auth.uid());
create policy trips_update on public.trips for update using (can_edit_trip(id)) with check (can_edit_trip(id));
create policy trips_delete on public.trips for delete using (owner_id = auth.uid());

create policy members_select on public.trip_members for select using (is_trip_member(trip_id));
create policy members_insert on public.trip_members for insert with check (trip_role(trip_id) = 'organizador' and user_id is null);
create policy members_update on public.trip_members for update using (trip_role(trip_id) = 'organizador');
create policy members_delete on public.trip_members for delete using (
  (trip_role(trip_id) = 'organizador' and role <> 'organizador') or (user_id = auth.uid() and role <> 'organizador'));

create policy invites_all on public.trip_invites for all using (trip_role(trip_id) = 'organizador') with check (trip_role(trip_id) = 'organizador' and created_by = auth.uid());

-- tabelas filhas de viagem: membros leem, editores escrevem
do $$ declare t text; begin
  foreach t in array array['trip_destinations','trip_preferences','trip_must_haves','days','itinerary_items','item_changes','reservations','polls','checklist_items','files']
  loop
    execute format('create policy %1$s_select on public.%1$I for select using (is_trip_member(trip_id))', t);
    execute format('create policy %1$s_write on public.%1$I for insert with check (can_edit_trip(trip_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update using (can_edit_trip(trip_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete using (can_edit_trip(trip_id))', t);
  end loop;
end $$;

-- itens de checklist: qualquer membro pode marcar como feito (inclusive visualizador)
create policy checklist_member_update on public.checklist_items for update using (is_trip_member(trip_id));

create policy options_select on public.item_options for select using (exists (select 1 from itinerary_items i where i.id = item_id and is_trip_member(i.trip_id)));
create policy options_write on public.item_options for all using (exists (select 1 from itinerary_items i where i.id = item_id and can_edit_trip(i.trip_id)))
  with check (exists (select 1 from itinerary_items i where i.id = item_id and can_edit_trip(i.trip_id)));

create policy segments_select on public.reservation_segments for select using (exists (select 1 from reservations r where r.id = reservation_id and is_trip_member(r.trip_id)));
create policy segments_write on public.reservation_segments for all using (exists (select 1 from reservations r where r.id = reservation_id and can_edit_trip(r.trip_id)))
  with check (exists (select 1 from reservations r where r.id = reservation_id and can_edit_trip(r.trip_id)));

-- gastos (RN-07)
create policy expenses_select on public.expenses for select using (can_see_expenses(trip_id));
create policy expenses_insert on public.expenses for insert with check (can_see_expenses(trip_id) and trip_role(trip_id) <> 'visualizador');
create policy expenses_update on public.expenses for update using (can_see_expenses(trip_id) and trip_role(trip_id) <> 'visualizador');
create policy expenses_delete on public.expenses for delete using (can_see_expenses(trip_id) and trip_role(trip_id) <> 'visualizador');
create policy payers_all on public.expense_payers for all using (exists (select 1 from expenses e where e.id = expense_id and can_see_expenses(e.trip_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and can_see_expenses(e.trip_id) and trip_role(e.trip_id) <> 'visualizador'));
create policy shares_all on public.expense_shares for all using (exists (select 1 from expenses e where e.id = expense_id and can_see_expenses(e.trip_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and can_see_expenses(e.trip_id) and trip_role(e.trip_id) <> 'visualizador'));
create policy settlements_all on public.settlements for all using (can_see_expenses(trip_id)) with check (can_see_expenses(trip_id));

-- enquetes e chat: qualquer membro participa
create policy poll_options_select on public.poll_options for select using (exists (select 1 from polls p where p.id = poll_id and is_trip_member(p.trip_id)));
create policy poll_options_write on public.poll_options for all using (exists (select 1 from polls p where p.id = poll_id and can_edit_trip(p.trip_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and can_edit_trip(p.trip_id)));
create policy votes_select on public.poll_votes for select using (exists (select 1 from polls p where p.id = poll_id and is_trip_member(p.trip_id)));
create policy votes_write on public.poll_votes for insert with check (user_id = auth.uid() and exists (select 1 from polls p where p.id = poll_id and is_trip_member(p.trip_id) and not p.closed));
create policy votes_update on public.poll_votes for update using (user_id = auth.uid());
create policy votes_delete on public.poll_votes for delete using (user_id = auth.uid());

create policy messages_select on public.messages for select using (is_trip_member(trip_id) and (channel = 'grupo' or author_id = auth.uid() or (is_pino and meta->>'for' = auth.uid()::text)));
create policy messages_insert on public.messages for insert with check (is_trip_member(trip_id) and author_id = auth.uid() and not is_pino);
create policy activity_select on public.activity_log for select using (is_trip_member(trip_id));
create policy activity_insert on public.activity_log for insert with check (is_trip_member(trip_id) and user_id = auth.uid());

-- lugares: base própria legível por todos logados; escrita por quem está logado (cache de OSM)
create policy places_select on public.places for select using (auth.uid() is not null);
create policy places_insert on public.places for insert with check (auth.uid() is not null);
create policy places_update on public.places for update using (auth.uid() is not null);
create policy quality_select on public.place_own_quality for select using (auth.uid() is not null);
create policy reports_own on public.place_reports for insert with check (user_id = auth.uid());
create policy reports_select on public.place_reports for select using (user_id = auth.uid() or is_admin());
create policy saved_own on public.saved_places for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- IA e dinheiro: só o próprio usuário lê; escrita de saldo só por funções
create policy gen_select on public.ai_generations for select using (user_id = auth.uid() or is_admin());
create policy gen_insert on public.ai_generations for insert with check (user_id = auth.uid());
create policy gen_update on public.ai_generations for update using (user_id = auth.uid());
create policy products_select on public.products for select using (true);
create policy wallet_select on public.credit_wallets for select using (user_id = auth.uid() or is_admin());
create policy ctx_select on public.credit_transactions for select using (user_id = auth.uid() or is_admin());
create policy orders_select on public.orders for select using (user_id = auth.uid() or is_admin());
create policy gateways_admin on public.payment_gateways for select using (is_admin());
create policy gateways_admin_upd on public.payment_gateways for update using (is_admin());
create policy webhooks_admin on public.webhook_events for select using (is_admin());
create policy settings_select on public.app_settings for select using (true);
create policy settings_admin on public.app_settings for update using (is_admin());
create policy notif_own on public.notifications for select using (user_id = auth.uid());
create policy notif_upd on public.notifications for update using (user_id = auth.uid());
create policy audit_admin on public.audit_log for select using (is_admin());
create policy listings_select on public.marketplace_listings for select using (status = 'publicado' or author_id = auth.uid() or is_admin());
create policy listings_write on public.marketplace_listings for insert with check (author_id = auth.uid() and is_trip_member(trip_id));

-- ---------- Realtime (RF-082) ----------
alter publication supabase_realtime add table public.itinerary_items, public.days, public.expenses, public.messages,
  public.polls, public.poll_votes, public.checklist_items, public.reservations, public.trip_members;
