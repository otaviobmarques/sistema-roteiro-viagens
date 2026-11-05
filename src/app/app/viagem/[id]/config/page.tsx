import { loadTrip } from "@/lib/trip";
import type { Day, Item } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import { TripSettings } from "@/components/settings/trip-settings";
import { WhatsAppSummary } from "@/components/export/whatsapp-summary";

export const metadata = { title: "Configurações da viagem" };

export default async function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, user, canEdit, destinations } = await loadTrip(id);
  const [{ data: days }, { data: items }, { data: reservations }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("id, day_id, title, start_time, duration_min, anchor, anchor_time, position, kind").eq("trip_id", id).not("day_id", "is", null).order("position"),
    supabase.from("reservations").select("id, title, start_at").eq("trip_id", id),
  ]);
  if (!canEdit) return <EmptyState title="Somente organizadores e editores alteram a viagem" text="Peça ao organizador para mudar seu papel no grupo." />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <TripSettings
        trip={trip}
        isOwner={trip.owner_id === user.id}
        days={(days ?? []) as Day[]}
        reservations={(reservations ?? []) as { id: string; title: string; start_at: string | null }[]}
        anchors={((items ?? []) as Item[]).filter((i) => i.anchor).map((i) => ({ id: i.id, title: i.title, day_id: i.day_id }))}
      />
      <WhatsAppSummary
        title={trip.title}
        cities={destinations.map((d) => d.city)}
        days={(days ?? []) as Day[]}
        items={(items ?? []) as Item[]}
        pace={trip.pace}
        publicUrl={trip.is_public && trip.slug ? `/v/${trip.slug}` : null}
      />
    </div>
  );
}
