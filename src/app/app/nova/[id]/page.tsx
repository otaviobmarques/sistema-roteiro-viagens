import { loadTrip } from "@/lib/trip";
import { PreviewClient } from "./preview";
import { transferLegs } from "@/lib/domain/multidest";

export const metadata = { title: "Prévia do roteiro" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, destinations, prefs, user } = await loadTrip(id);
  const [{ data: must }, { data: wallet }, { data: lastPreview }] = await Promise.all([
    supabase.from("trip_must_haves").select("original_text, status").eq("trip_id", id),
    supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("ai_generations").select("output").eq("trip_id", id).eq("kind", "previa").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const legs = transferLegs(destinations.filter((d) => d.lat != null).map((d) => ({ id: d.id, city: d.city, lat: d.lat!, lng: d.lng! })));
  return (
    <PreviewClient
      trip={trip}
      destinations={destinations}
      legs={legs}
      profile={prefs?.travel_profile ?? "classica"}
      interests={(prefs?.interests as Record<string, number>) ?? {}}
      mustHaves={(must ?? []).map((m) => m.original_text)}
      credits={wallet?.balance ?? 0}
      ai={lastPreview?.output ?? null}
      isOwner={trip.owner_id === user.id}
    />
  );
}
