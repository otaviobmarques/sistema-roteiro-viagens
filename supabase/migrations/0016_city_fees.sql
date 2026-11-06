-- Taxas locais por cidade (taxa ambiental, de turismo, de acesso), pesquisadas pelo Pino e reaproveitadas.
create table if not exists public.city_fees (
  city text primary key,              -- "cidade|pais" normalizado
  display_name text not null,
  data jsonb not null,                -- { fees: [...] }
  updated_at timestamptz not null default now()
);
alter table public.city_fees enable row level security;
create policy city_fees_select on public.city_fees for select using (auth.uid() is not null);

create or replace function public.server_upsert_city_fees(p_secret text, p_city text, p_display text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  insert into city_fees (city, display_name, data, updated_at) values (p_city, p_display, p_data, now())
  on conflict (city) do update set display_name = excluded.display_name, data = excluded.data, updated_at = now();
end $$;
revoke execute on function public.server_upsert_city_fees(text,text,text,jsonb) from public;
grant execute on function public.server_upsert_city_fees(text,text,text,jsonb) to anon, authenticated;
