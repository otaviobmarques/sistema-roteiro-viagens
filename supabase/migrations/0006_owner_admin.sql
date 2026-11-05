-- Dono do produto vira administrador do backoffice quando o e-mail é confirmado (prova de posse do e-mail)
create or replace function public.grant_owner_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'otaviobmarques@gmail.com' and new.email_confirmed_at is not null then
    update profiles set is_admin = true where id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.grant_owner_admin() from public, anon, authenticated;
create trigger on_auth_user_confirmed_admin after insert or update of email_confirmed_at on auth.users
  for each row execute function public.grant_owner_admin();
