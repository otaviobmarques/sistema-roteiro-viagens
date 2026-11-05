import { loadTrip } from "@/lib/trip";
import { transferLegs } from "@/lib/domain/multidest";
import { TripMapView } from "./map-view";
import type { Day, Item } from "@/lib/types";

export const metadata = { title: "Mapa da viagem" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, destinations, user } = await loadTrip(id);
  const [{ data: days }, { data: items }, { data: saved }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("lat", "is", null),
    supabase.from("saved_places").select("places(id, name, lat, lng)").eq("user_id", user.id).limit(100),
  ]);
  const geo = destinations.filter((d) => d.lat != null);
  const legs = transferLegs(geo.map((d) => ({ id: d.id, city: d.city, lat: d.lat!, lng: d.lng! })));
  return (
    <TripMapView
      destinations={geo}
      legs={legs}
      days={(days ?? []) as Day[]}
      items={(items ?? []) as Item[]}
      saved={((saved ?? []) as unknown as { places: { id: string; name: string; lat: number; lng: number } | null }[]).map((s) => s.places).filter(Boolean) as { id: string; name: string; lat: number; lng: number }[]}
    />
  );
}
