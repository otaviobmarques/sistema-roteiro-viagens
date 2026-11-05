export type Role = "organizador" | "editor" | "visualizador";

export type Profile = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  home_city: string | null;
  travel_profile: "mochilao" | "classica" | "experiencia";
  pace: "leve" | "equilibrado" | "intenso";
  restrictions: Record<string, unknown>;
  pix_key: string | null;
  onboarded: boolean;
  is_admin: boolean;
  suspended: boolean;
  created_at: string;
};

export type Trip = {
  id: string;
  owner_id: string;
  title: string;
  cover_color: string | null;
  emoji: string | null;
  status: "rascunho" | "planejando" | "confirmada" | "em_andamento" | "concluida" | "arquivada";
  start_date: string | null;
  end_date: string | null;
  currency: string;
  budget_cents: number | null;
  pace: string;
  travelers_adults: number;
  travelers_children: number;
  children_ages: number[];
  origin_city: string | null;
  is_public: boolean;
  public_hide_costs: boolean;
  slug: string | null;
  inbox_alias: string | null;
  viability_score: number | null;
  generated: boolean;
  created_at: string;
};

export type Destination = {
  id: string;
  trip_id: string;
  city: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  locked: boolean;
  position: number;
};

export type Day = { id: string; trip_id: string; destination_id: string | null; date: string | null; title: string | null; notes: string | null; day_start: string; position: number };

export type Item = {
  id: string;
  trip_id: string;
  day_id: string | null;
  kind: "lugar" | "atividade" | "refeicao" | "trajeto" | "hospedagem" | "nota" | "livre";
  title: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  interest_category: string | null;
  start_time: string | null;
  duration_min: number;
  anchor: boolean;
  anchor_time: string | null;
  transport_mode: string | null;
  travel_min: number | null;
  cost_cents: number | null;
  currency: string | null;
  opening_hours: string | null;
  outdoor: boolean;
  must_have: boolean;
  travel_profile: string | null;
  score: number | null;
  why: string | null;
  verified: boolean;
  status: string;
  done: boolean;
  notes: string | null;
  position: number;
  updated_at?: string;
};

export type ItemOption = {
  id: string;
  item_id: string;
  title: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  travel_profile: string;
  est_price_cents: number | null;
  score: number | null;
  score_quality: number | null;
  reason: string | null;
  chosen: boolean;
};

export type Member = {
  id: string;
  trip_id: string;
  user_id: string | null;
  guest_name: string | null;
  role: Role;
  can_see_expenses: boolean;
  joined_at: string;
  profiles?: { name: string | null; avatar_url: string | null; pix_key: string | null } | null;
};

export type Reservation = {
  id: string;
  trip_id: string;
  kind: string;
  title: string;
  status: string;
  code: string | null;
  provider: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  value_cents: number | null;
  currency: string | null;
  free_cancel_until: string | null;
  source: string;
  item_id: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  trip_id: string;
  description: string;
  category: string;
  amount_cents: number;
  currency: string;
  fx_rate: number;
  amount_brl_cents: number;
  spent_on: string;
  reservation_id: string | null;
  split_mode: string;
  created_by: string | null;
  created_at: string;
};

export function memberName(m: Member | undefined | null): string {
  if (!m) return "—";
  return m.profiles?.name || m.guest_name || "Convidado";
}

export function initials(name: string | null | undefined): string {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
}
