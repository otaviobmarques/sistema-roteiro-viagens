-- Suporte: o administrador pode refazer o roteiro de um cliente (ex.: destino que era um país inteiro).
-- Políticas aditivas: o acesso dos usuários continua igual.
create policy days_admin_all on public.days for all using (is_admin()) with check (is_admin());
create policy itinerary_items_admin_all on public.itinerary_items for all using (is_admin()) with check (is_admin());
create policy trip_destinations_admin_all on public.trip_destinations for all using (is_admin()) with check (is_admin());
create policy trip_must_haves_admin_all on public.trip_must_haves for all using (is_admin()) with check (is_admin());
create policy trips_admin_update on public.trips for update using (is_admin()) with check (is_admin());
