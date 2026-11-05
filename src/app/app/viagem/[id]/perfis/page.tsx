import Link from "next/link";
import { loadTrip } from "@/lib/trip";
import { EmptyState } from "@/components/ui";
import { ProfilesClient } from "./profiles-client";
import type { Day, Item, ItemOption } from "@/lib/types";

export const metadata = { title: "Comparar perfis" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, prefs, canEdit, destinations } = await loadTrip(id);
  const [{ data: days }, { data: items }, { data: options }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("day_id", "is", null).order("position"),
    supabase.from("item_options").select("*, itinerary_items!inner(trip_id)").eq("itinerary_items.trip_id", id),
  ]);
  if (!options?.length) {
    return <EmptyState mood="achei" title="Comparação disponível no roteiro completo" text="Quando o Pino gera o roteiro, cada hospedagem, refeição e passeio vem com opções nos três perfis, e aqui você vê o mesmo roteiro em Mochilão, Clássica e Experiência com o preço de cada." action={<Link href={`/app/nova/${id}`} className="btn-primary">Ver prévia e gerar</Link>} />;
  }
  return (
    <ProfilesClient
      tripId={id}
      current={prefs?.travel_profile ?? "classica"}
      canEdit={canEdit}
      people={trip.travelers_adults + trip.travelers_children}
      rooms={Math.max(1, Math.ceil(trip.travelers_adults / 2))}
      nights={destinations.reduce((s, d) => s + (d.days ?? 0), 0) || 1}
      mustCount={(items ?? []).filter((i) => i.must_have).length}
      days={(days ?? []) as Day[]}
      items={(items ?? []) as Item[]}
      options={((options ?? []) as (ItemOption & { itinerary_items?: unknown })[]).map(({ itinerary_items: _x, ...o }) => o as ItemOption)}
    />
  );
}
