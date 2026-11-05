import { loadTrip } from "@/lib/trip";
import { GroupClient, type PollFull, type ChatMessage, type ActivityRow, type InviteRow } from "@/components/group/group-client";

export const metadata = { title: "Grupo" };

export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, trip, members, role, canEdit } = await loadTrip(id);
  const isOrganizer = role === "organizador";
  const [{ data: polls }, { data: messages }, { data: activity }, { data: days }, invitesRes] = await Promise.all([
    supabase.from("polls").select("*, poll_options(*), poll_votes(*)").eq("trip_id", id).order("created_at", { ascending: false }),
    supabase.from("messages").select("*").eq("trip_id", id).eq("channel", "grupo").order("created_at", { ascending: false }).limit(100),
    supabase.from("activity_log").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("days").select("id, date, title, position").eq("trip_id", id).order("position"),
    isOrganizer ? supabase.from("trip_invites").select("*").eq("trip_id", id).order("expires_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  return (
    <GroupClient
      trip={trip}
      members={members}
      userId={user.id}
      role={role}
      canEdit={canEdit}
      initialPolls={(polls ?? []) as PollFull[]}
      initialMessages={((messages ?? []) as ChatMessage[]).reverse()}
      activity={(activity ?? []) as ActivityRow[]}
      days={(days ?? []) as { id: string; date: string | null; title: string | null; position: number }[]}
      initialInvites={(invitesRes.data ?? []) as InviteRow[]}
    />
  );
}
