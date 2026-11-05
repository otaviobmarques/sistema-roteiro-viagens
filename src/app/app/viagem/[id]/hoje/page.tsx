import { loadTrip } from "@/lib/trip";
import type { Day, Item } from "@/lib/types";
import { TodayClient } from "@/components/today/today-client";

export const metadata = { title: "Hoje" };

export default async function HojePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, destinations, canEdit } = await loadTrip(id);
  const [{ data: days }, { data: items }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("day_id", "is", null).order("position"),
  ]);
  return (
    <TodayClient
      tripId={id}
      tripTitle={trip.title}
      pace={trip.pace}
      days={(days ?? []) as Day[]}
      items={(items ?? []) as Item[]}
      destinations={destinations.map((d) => ({ id: d.id, city: d.city, country: d.country, lat: d.lat, lng: d.lng }))}
      canEdit={canEdit}
    />
  );
}
