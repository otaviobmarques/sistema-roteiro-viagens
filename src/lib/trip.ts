import { notFound } from "next/navigation";
import { requireUser } from "./supabase/server";
import type { Trip, Member, Destination, Role } from "./types";

/** Carrega a viagem com membros e papel do usuário. 404 se não for membro (RLS). */
export async function loadTrip(id: string) {
  const { supabase, user } = await requireUser();
  const { data: trip } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!trip) notFound();
  const [{ data: members }, { data: destinations }, { data: prefs }] = await Promise.all([
    supabase.from("trip_members").select("*, profiles(name, avatar_url, pix_key)").eq("trip_id", id).order("joined_at"),
    supabase.from("trip_destinations").select("*").eq("trip_id", id).order("position"),
    supabase.from("trip_preferences").select("*").eq("trip_id", id).maybeSingle(),
  ]);
  const me = (members ?? []).find((m) => m.user_id === user.id) as Member | undefined;
  const role: Role = (me?.role as Role) ?? "visualizador";
  return {
    supabase,
    user,
    trip: trip as Trip,
    members: (members ?? []) as Member[],
    destinations: (destinations ?? []) as Destination[],
    prefs,
    me,
    role,
    canEdit: role === "organizador" || role === "editor",
    canSeeExpenses: role === "organizador" || !!me?.can_see_expenses,
  };
}

export function tripPeriod(t: Pick<Trip, "start_date" | "end_date">) {
  if (!t.start_date) return "datas a definir";
  const f = (s: string) => s.split("-").reverse().slice(0, 2).join("/");
  return t.end_date ? `${f(t.start_date)} → ${f(t.end_date)}` : f(t.start_date);
}

export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", planejando: "Planejando", confirmada: "Confirmada", em_andamento: "Em andamento", concluida: "Concluída", arquivada: "Arquivada",
};

export const PROFILE_LABEL: Record<string, string> = { mochilao: "Mochilão", classica: "Clássica", experiencia: "Experiência" };
