-- Suporte: ao refazer um roteiro, o administrador também grava o checklist de bônus.
create policy checklist_items_admin_all on public.checklist_items for all using (is_admin()) with check (is_admin());
