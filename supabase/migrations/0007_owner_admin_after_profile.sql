-- gatilhos rodam em ordem alfabética: este roda depois de on_auth_user_created (perfil já existe)
create trigger zz_on_auth_user_owner_admin after insert on auth.users
  for each row execute function public.grant_owner_admin();
