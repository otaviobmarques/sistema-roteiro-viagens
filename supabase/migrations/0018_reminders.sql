-- Lembretes automáticos (60, 30 e 7 dias, 48 h e dia do embarque): e-mail, push no celular e aviso no app.
create table if not exists public.reminder_log (
  trip_id uuid not null references public.trips(id) on delete cascade,
  milestone int not null,
  sent_at timestamptz not null default now(),
  primary key (trip_id, milestone)
);
alter table public.reminder_log enable row level security;
create policy reminder_log_admin on public.reminder_log for select using (is_admin());

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- viagens que fazem marco hoje, com as tarefas pendentes até o próximo marco (só o servidor chama)
create or replace function public.server_due_reminders(p_secret text, p_today date) returns json
language plpgsql security definer set search_path = public, auth, private as $$
declare res json;
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  with m(ms, next_ms) as (values (60, 30), (30, 7), (7, 2), (2, 0), (0, -1)),
  due as (
    select t.id, t.title, t.start_date, t.owner_id, m.ms, m.next_ms
    from trips t join m on t.start_date = p_today + m.ms
    where t.generated and t.status <> 'arquivada'
      and not exists (select 1 from reminder_log r where r.trip_id = t.id and r.milestone = m.ms)
  )
  select coalesce(json_agg(json_build_object(
    'trip_id', d.id, 'title', d.title, 'start_date', d.start_date, 'milestone', d.ms, 'user_id', d.owner_id,
    'email', u.email, 'name', p.name,
    'tasks', (select coalesce(json_agg(json_build_object('label', c.label, 'due_date', c.due_date) order by c.due_date nulls last, c.position), '[]')
              from (select * from checklist_items c where c.trip_id = d.id and c.list = 'pre_viagem' and not c.done
                    and c.due_date is not null and c.due_date <= d.start_date - greatest(d.next_ms, 0) order by c.due_date limit 10) c),
    'push', (select coalesce(json_agg(json_build_object('endpoint', s.endpoint, 'keys', s.keys)), '[]') from push_subscriptions s where s.user_id = d.owner_id)
  )), '[]') into res
  from due d join auth.users u on u.id = d.owner_id join profiles p on p.id = d.owner_id;
  return res;
end $$;
revoke execute on function public.server_due_reminders(text, date) from public;
grant execute on function public.server_due_reminders(text, date) to anon, authenticated;

-- registra o envio (não repete) e cria o aviso dentro do app
create or replace function public.server_mark_reminder(p_secret text, p_trip uuid, p_milestone int, p_user uuid, p_title text, p_body text) returns boolean
language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  insert into reminder_log (trip_id, milestone) values (p_trip, p_milestone) on conflict do nothing;
  if not found then return false; end if;
  insert into notifications (user_id, trip_id, kind, title, body, link) values (p_user, p_trip, 'lembrete', p_title, p_body, '/app/viagem/' || p_trip || '/mala');
  return true;
end $$;
revoke execute on function public.server_mark_reminder(text, uuid, int, uuid, text, text) from public;
grant execute on function public.server_mark_reminder(text, uuid, int, uuid, text, text) to anon, authenticated;

-- inscrição de push expirada: o servidor remove
create or replace function public.server_drop_push(p_secret text, p_endpoint text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint;
end $$;
revoke execute on function public.server_drop_push(text, text) from public;
grant execute on function public.server_drop_push(text, text) to anon, authenticated;
