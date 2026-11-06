-- Backoffice: cadastrar clientes com usuário/senha, redefinir senha e ver o login de cada conta.
-- Usuário sem "@" vira o e-mail interno <usuario>@usuarios.rotta365.app (nunca recebe mensagens).
create or replace function public.admin_login_email(p_login text) returns text
language sql immutable as $$
  select case when position('@' in p_login) > 0 then lower(trim(p_login)) else lower(trim(p_login)) || '@usuarios.rotta365.app' end
$$;

create or replace function public.admin_create_user(p_login text, p_password text, p_name text, p_credits int default 0, p_note text default null) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid(); em text;
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  if p_login is null or length(trim(p_login)) < 3 then raise exception 'informe um usuário ou e-mail'; end if;
  if position('@' in p_login) = 0 and trim(p_login) !~ '^[A-Za-z0-9._-]{3,30}$' then
    raise exception 'usuário pode ter letras, números, ponto, hífen e sublinhado (3 a 30)';
  end if;
  if p_password is null or length(p_password) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  if coalesce(p_credits, 0) < 0 or coalesce(p_credits, 0) > 1000 then raise exception 'créditos inválidos'; end if;
  em := admin_login_email(p_login);
  if exists (select 1 from auth.users where lower(email) = em) then raise exception 'já existe uma conta com esse login'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), split_part(em, '@', 1)), 'created_by_admin', true),
    now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());

  if coalesce(p_credits, 0) > 0 then
    update credit_wallets set balance = balance + p_credits, updated_at = now() where user_id = uid;
    insert into credit_transactions (user_id, kind, amount, expires_at, note)
      values (uid, 'bonus', p_credits, now() + interval '12 months', coalesce(nullif(trim(p_note), ''), 'Cortesia'));
  end if;
  insert into audit_log (actor_id, action, target, details)
    values (auth.uid(), 'criar_usuario', uid::text, json_build_object('login', em, 'creditos', coalesce(p_credits, 0), 'nota', p_note));
  return uid;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  if p_password is null or length(p_password) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  if not found then raise exception 'usuário não encontrado'; end if;
  insert into audit_log (actor_id, action, target, details) values (auth.uid(), 'redefinir_senha', p_user::text, null);
end $$;

create or replace function public.admin_user_logins(p_ids uuid[]) returns table (id uuid, login text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'apenas administradores'; end if;
  return query select u.id, case when u.email like '%@usuarios.rotta365.app' then split_part(u.email, '@', 1) else u.email end::text, u.last_sign_in_at
    from auth.users u where u.id = any(p_ids);
end $$;

revoke execute on function public.admin_create_user(text,text,text,int,text) from public, anon;
revoke execute on function public.admin_set_password(uuid,text) from public, anon;
revoke execute on function public.admin_user_logins(uuid[]) from public, anon;
grant execute on function public.admin_create_user(text,text,text,int,text), public.admin_set_password(uuid,text), public.admin_user_logins(uuid[]) to authenticated;
