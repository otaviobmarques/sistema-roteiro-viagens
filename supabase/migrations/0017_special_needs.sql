-- Necessidades especiais da viagem (alergia, mobilidade, pet, gestante, esportes) e o guia personalizado gerado para elas.
alter table public.trip_preferences add column if not exists special_needs jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists special_guide jsonb;
