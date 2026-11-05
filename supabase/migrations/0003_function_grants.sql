-- Restringe funções internas: gatilhos não são chamáveis por RPC; funções de usuário exigem login.
-- Continuam públicas (anon): get_public_trip, invite_preview (leitura pública) e
-- confirm_payment / create_order_record (protegidas por segredo interno, usadas pelo servidor).
alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_trip() from public, anon, authenticated;
revoke execute on function public.protect_profile_flags() from public, anon, authenticated;
revoke execute on function public.protect_trip_fields() from public, anon, authenticated;
revoke execute on function public.admin_grant_credits(uuid,int,text) from public, anon;
revoke execute on function public.admin_set_suspended(uuid,boolean) from public, anon;
revoke execute on function public.admin_metrics() from public, anon;
revoke execute on function public.consume_credit(uuid,uuid) from public, anon;
revoke execute on function public.copy_trip(uuid,date) from public, anon;
revoke execute on function public.has_credit_for(uuid) from public, anon;
revoke execute on function public.join_trip(text) from public, anon;
revoke execute on function public.previews_left() from public, anon;
revoke execute on function public.transfer_credits(uuid,int) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_trip_member(uuid) from public, anon;
revoke execute on function public.can_edit_trip(uuid) from public, anon;
revoke execute on function public.can_see_expenses(uuid) from public, anon;
revoke execute on function public.trip_role(uuid) from public, anon;
grant execute on function public.admin_grant_credits(uuid,int,text), public.admin_set_suspended(uuid,boolean), public.admin_metrics(),
  public.consume_credit(uuid,uuid), public.copy_trip(uuid,date), public.has_credit_for(uuid), public.join_trip(text),
  public.previews_left(), public.transfer_credits(uuid,int), public.is_admin(), public.is_trip_member(uuid),
  public.can_edit_trip(uuid), public.can_see_expenses(uuid), public.trip_role(uuid) to authenticated;
