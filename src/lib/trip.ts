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

export { tripPeriod, STATUS_LABEL, PROFILE_LABEL } from "./labels";
