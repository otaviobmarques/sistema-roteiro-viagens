import { loadTrip } from "@/lib/trip";
import { memberName } from "@/lib/types";
import { ChecklistClient, type ChecklistItem } from "@/components/checklist/checklist-client";
import { PushToggle } from "@/components/push-toggle";

export const metadata = { title: "Mala e checklist" };

export default async function MalaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, members, canEdit, me, user } = await loadTrip(id);
  const { data } = await supabase.from("checklist_items").select("*").eq("trip_id", id).order("position");
  return (
    <div className="space-y-4">
    <PushToggle userId={user.id} />
    <ChecklistClient
      tripId={id}
      items={(data ?? []) as ChecklistItem[]}
      members={members.map((m) => ({ id: m.id, name: memberName(m) }))}
      canEdit={canEdit}
      myMemberId={me?.id ?? null}
    />
    </div>
  );
}
