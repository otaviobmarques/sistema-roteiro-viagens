-- O dono enxerga a viagem já no INSERT ... RETURNING (antes do gatilho criar o membro).
-- Política adicional (as políticas de SELECT se somam com OR).
create policy trips_select_owner on public.trips for select using (owner_id = auth.uid());
