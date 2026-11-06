-- Guia "Antes de ir" por país (seguro viagem, saúde, celular, dinheiro, tomada, documentos), gerado uma vez e reaproveitado.
create table if not exists public.country_guides (
  country text primary key,           -- nome normalizado (minúsculas, sem acento)
  display_name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.country_guides enable row level security;
create policy country_guides_select on public.country_guides for select using (auth.uid() is not null);

-- só o servidor grava (segredo interno), para ninguém alterar o guia de todos
create or replace function public.server_upsert_country_guide(p_secret text, p_country text, p_display text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or p_secret <> (select value from private.secrets where key = 'webhook_internal') then
    raise exception 'não autorizado';
  end if;
  insert into country_guides (country, display_name, data, updated_at) values (p_country, p_display, p_data, now())
  on conflict (country) do update set display_name = excluded.display_name, data = excluded.data, updated_at = now();
end $$;
revoke execute on function public.server_upsert_country_guide(text,text,text,jsonb) from public;
grant execute on function public.server_upsert_country_guide(text,text,text,jsonb) to anon, authenticated;

-- links de parceiros (afiliados) cadastrados pelo administrador
insert into public.app_settings (key, value) values ('affiliates', '{"seguro": {"url": "", "label": ""}, "esim": {"url": "", "label": ""}}')
on conflict (key) do nothing;
