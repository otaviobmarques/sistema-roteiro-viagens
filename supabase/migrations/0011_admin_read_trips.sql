-- Backoffice: o administrador pode LER (somente leitura) os roteiros de todos os clientes,
-- para acompanhar gerações e baixar o PDF. Políticas aditivas: não mudam o acesso dos usuários.
create policy days_select_admin on public.days for select using (is_admin());
create policy itinerary_items_select_admin on public.itinerary_items for select using (is_admin());
create policy trip_destinations_select_admin on public.trip_destinations for select using (is_admin());
create policy trip_preferences_select_admin on public.trip_preferences for select using (is_admin());
create policy trip_members_select_admin on public.trip_members for select using (is_admin());
create policy reservations_select_admin on public.reservations for select using (is_admin());
create policy checklist_items_select_admin on public.checklist_items for select using (is_admin());
create policy trip_must_haves_select_admin on public.trip_must_haves for select using (is_admin());
