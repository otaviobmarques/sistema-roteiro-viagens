-- Rotta 365 · esquema principal (seção 13 do escopo)
-- Valores monetários sempre em centavos inteiros (RN-04).

create extension if not exists pgcrypto;

-- ============ Perfis e contas (M01) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  home_city text,
  locale text not null default 'pt-BR',
  default_currency text not null default 'BRL',
  travel_profile text not null default 'classica' check (travel_profile in ('mochilao','classica','experiencia')),
  pace text not null default 'equilibrado' check (pace in ('leve','equilibrado','intenso')),
  restrictions jsonb not null default '{}'::jsonb,
  pix_key text,
  onboarded boolean not null default false,
  is_admin boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  weight smallint not null check (weight between 1 and 3),
  primary key (user_id, category)
);

-- ============ Viagens (M02) ============
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  title text not null,
  cover_color text default '#205BFF',
  emoji text,
  status text not null default 'planejando' check (status in ('rascunho','planejando','confirmada','em_andamento','concluida','arquivada')),
  start_date date,
  end_date date,
  currency text not null default 'BRL',
  budget_cents bigint,
  pace text not null default 'equilibrado',
  travelers_adults int not null default 2,
  travelers_children int not null default 0,
  children_ages int[] not null default '{}',
  origin_city text,
  is_public boolean not null default false,
  public_hide_costs boolean not null default true,
  slug text unique,
  inbox_alias text unique default lower(substr(md5(gen_random_uuid()::text),1,8)),
  viability_score int,
  generated boolean not null default false,
  adjustments_used jsonb not null default '{"days_redone":0,"destinations_added":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  guest_name text,
  role text not null default 'editor' check (role in ('organizador','editor','visualizador')),
  can_see_expenses boolean not null default true,
  invited_by uuid references public.profiles(id),
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table public.trip_invites (
  token text primary key default encode(gen_random_bytes(16),'hex'),
  trip_id uuid not null references public.trips(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','visualizador')),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default now() + interval '14 days',
  uses int not null default 0
);

create table public.trip_destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  city text not null,
  country text,
  lat double precision,
  lng double precision,
  start_date date,
  end_date date,
  days int,
  locked boolean not null default false,
  position int not null default 0
);

create table public.trip_preferences (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  travel_profile text not null default 'classica' check (travel_profile in ('mochilao','classica','experiencia')),
  budget_cap_cents bigint,
  occasion text,
  interests jsonb not null default '{}'::jsonb,
  special_days jsonb not null default '[]'::jsonb,
  notes text
);

create table public.trip_must_haves (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  original_text text not null,
  place_id uuid,
  status text not null default 'travado' check (status in ('travado','sem_espaco','aplicado','recusado')),
  created_at timestamptz not null default now()
);

-- ============ Lugares (M05, M23) — base própria (OSM/Wikidata) ============
create table public.places (
  id uuid primary key default gen_random_uuid(),
  osm_id text unique,
  wikidata_id text,
  google_place_id text,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  category text,
  interest_category text,
  tags jsonb not null default '{}'::jsonb,
  own_price_level smallint,
  opening_hours text,
  accessibility text,
  website text,
  phone text,
  city text,
  updated_at timestamptz not null default now()
);
create index places_city_idx on public.places (city);

create table public.place_own_quality (
  place_id uuid primary key references public.places(id) on delete cascade,
  avg_user_rating numeric(3,2),
  total_reviews int not null default 0,
  open_reports int not null default 0,
  own_score numeric(4,2),
  updated_at timestamptz not null default now()
);

create table public.place_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  reason text not null check (reason in ('fechou','mudou','decepcionou','perigo')),
  status text not null default 'aberta',
  created_at timestamptz not null default now()
);

create table public.saved_places (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  list text default 'Quero ir',
  note text,
  visited boolean not null default false,
  primary key (user_id, place_id)
);

-- ============ Roteiro (M04) ============
create table public.days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  destination_id uuid references public.trip_destinations(id) on delete set null,
  date date,
  title text,
  notes text,
  day_start text not null default '09:00',
  position int not null default 0
);
create index days_trip_idx on public.days (trip_id, position);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid references public.days(id) on delete cascade, -- null = lista de ideias (RF-036)
  kind text not null default 'lugar' check (kind in ('lugar','atividade','refeicao','trajeto','hospedagem','nota','livre')),
  title text not null,
  place_id uuid references public.places(id) on delete set null,
  lat double precision,
  lng double precision,
  category text,
  interest_category text,
  start_time text,          -- HH:MM
  duration_min int not null default 60,
  anchor boolean not null default false,
  anchor_time text,         -- HH:MM fixo
  transport_mode text default 'a_pe',
  travel_min int,
  cost_cents bigint default 0,
  currency text default 'BRL',
  opening_hours text,
  outdoor boolean not null default false,
  must_have boolean not null default false,
  travel_profile text,
  score numeric(3,1),
  why text,
  verified boolean not null default false,
  status text not null default 'planejado',
  done boolean not null default false,
  notes text,
  position int not null default 0,
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index items_day_idx on public.itinerary_items (day_id, position);
create index items_trip_idx on public.itinerary_items (trip_id);

create table public.item_options (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itinerary_items(id) on delete cascade,
  title text not null,
  place_id uuid references public.places(id) on delete set null,
  lat double precision,
  lng double precision,
  travel_profile text not null,
  est_price_cents bigint,
  score numeric(3,1),
  score_quality numeric(3,1),
  score_fit numeric(3,1),
  reason text,
  chosen boolean not null default false
);

-- Histórico para desfazer (RN-03: 15 minutos)
create table public.item_changes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id),
  source text not null default 'usuario', -- usuario | pino
  description text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- ============ Reservas (M07) ============
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('voo','hotel','aluguel','trem','onibus','carro','barco','ingresso','restaurante','passeio','seguro','outro')),
  title text not null,
  status text not null default 'confirmada',
  code text,
  provider text,
  start_at timestamptz,
  end_at timestamptz,
  tz_start text,
  tz_end text,
  location text,
  value_cents bigint,
  currency text default 'BRL',
  free_cancel_until timestamptz,
  source text not null default 'manual' check (source in ('email','upload','manual','texto')),
  extracted jsonb,
  item_id uuid references public.itinerary_items(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.reservation_segments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  origin text, destination text,
  departs_at timestamptz, arrives_at timestamptz,
  number text, position int not null default 0
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  link_kind text, link_id uuid,
  path text not null, mime text, size_bytes bigint,
  offline boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ Gastos (M08) ============
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null,
  category text not null default 'outros',
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL',
  fx_rate numeric(14,6) not null default 1,
  amount_brl_cents bigint not null,
  spent_on date not null default current_date,
  reservation_id uuid references public.reservations(id) on delete set null,
  split_mode text not null default 'igual',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.expense_payers (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  amount_cents bigint not null,
  primary key (expense_id, member_id)
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  amount_cents bigint not null,
  primary key (expense_id, member_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_member uuid not null references public.trip_members(id) on delete cascade,
  to_member uuid not null references public.trip_members(id) on delete cascade,
  amount_cents bigint not null,
  method text not null default 'pix',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ Grupo (M09) ============
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  question text not null,
  day_id uuid references public.days(id) on delete set null,
  closes_at timestamptz,
  closed boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  lat double precision, lng double precision,
  position int not null default 0
);
create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (poll_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid references public.profiles(id),
  is_pino boolean not null default false,
  channel text not null default 'grupo', -- grupo | pino
  body text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action text not null,
  created_at timestamptz not null default now()
);

-- ============ Mala e checklist (M10) ============
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  list text not null default 'mala' check (list in ('mala','pre_viagem')),
  category text not null default 'Geral',
  label text not null,
  assignee uuid references public.trip_members(id) on delete set null,
  shared boolean not null default false,
  done boolean not null default false,
  due_date date,
  position int not null default 0
);

-- ============ IA, créditos e pagamentos (M03, M19, M24) ============
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  trip_id uuid references public.trips(id) on delete set null,
  kind text not null check (kind in ('previa','completa','ajuste','descoberta','chat','extracao','mala')),
  status text not null default 'iniciada' check (status in ('iniciada','concluida','falhou')),
  input jsonb,
  output jsonb,
  score int,
  input_tokens int, output_tokens int,
  cost_ai_cents numeric(10,2) default 0,
  cost_places_cents numeric(10,2) default 0,
  cost_routes_cents numeric(10,2) default 0,
  cost_total_cents numeric(10,2) default 0,
  credit_transaction_id uuid,
  duration_ms int,
  error text,
  created_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  name text not null,
  credits int not null,
  price_cents bigint not null,
  validity_months int not null default 12,
  active boolean not null default true
);
insert into public.products (id, name, credits, price_cents) values
  ('avulso','Roteiro avulso',1,2990),
  ('combo_5','Combo 5 roteiros',5,13900),
  ('combo_10','Combo 10 roteiros',10,24900);

create table public.credit_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('compra','consumo','estorno','bonus','expiracao','transferencia')),
  amount int not null,
  order_id uuid,
  trip_id uuid references public.trips(id) on delete set null,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  product_id text not null references public.products(id),
  amount_cents bigint not null,
  method text not null default 'pix' check (method in ('pix','cartao','boleto')),
  gateway text,
  gateway_id text,
  pix_payload text,
  pix_qr_base64 text,
  invoice_url text,
  status text not null default 'pendente' check (status in ('pendente','pago','estornado','expirado','falhou')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('asaas','mercado_pago','stripe')),
  role text not null check (role in ('principal','reserva','internacional')),
  environment text not null default 'sandbox' check (environment in ('sandbox','producao')),
  active boolean not null default false,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (provider, role)
);
insert into public.payment_gateways (provider, role, config) values
  ('asaas','principal','{"pix":true,"cartao":true,"boleto":false,"pix_expiracao_min":30,"parcelas_max":3}'),
  ('mercado_pago','reserva','{}'),
  ('stripe','internacional','{}');

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event text not null,
  external_id text not null unique,
  payload jsonb,
  status text not null default 'processado',
  attempts int not null default 1,
  received_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null
);
insert into public.app_settings values
  ('welcome_credits', '1'),
  ('free_previews_per_day', '3');

-- ============ Notificações e auditoria (M14, M18) ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  price_cents bigint not null default 0,
  status text not null default 'em_revisao',
  sales int not null default 0,
  created_at timestamptz not null default now()
);
