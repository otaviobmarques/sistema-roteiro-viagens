-- Lembretes que o próprio usuário cria (ex.: cancelamento grátis de reserva) e auditoria do backoffice
create policy notif_insert_self on public.notifications for insert with check (user_id = auth.uid());
create policy audit_admin_insert on public.audit_log for insert with check (is_admin() and actor_id = auth.uid());
