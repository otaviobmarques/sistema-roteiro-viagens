import { loadTrip } from "@/lib/trip";
import { memberName } from "@/lib/types";
import { ChecklistClient, type ChecklistItem } from "@/components/checklist/checklist-client";

export const metadata = { title: "Mala e checklist" };

export default async function MalaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, members, canEdit, me } = await loadTrip(id);
  const { data } = await supabase.from("checklist_items").select("*").eq("trip_id", id).order("position");
  return (
    <ChecklistClient
      tripId={id}
      items={(data ?? []) as ChecklistItem[]}
      members={members.map((m) => ({ id: m.id, name: memberName(m) }))}
      canEdit={canEdit}
      myMemberId={me?.id ?? null}
    />
  );
}
