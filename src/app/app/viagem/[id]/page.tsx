import { loadTrip } from "@/lib/trip";
import { weather } from "@/lib/context";
import { addDays, daysBetween } from "@/lib/domain/time";
import { Planner } from "@/components/planner/planner";
import type { Day, Item, ItemOption } from "@/lib/types";

export default async function TripPlannerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pino?: string; gerado?: string; dia?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, trip, destinations, canEdit, prefs, user } = await loadTrip(id);

  // Viagem com datas e sem dias (planejamento manual): cria os dias a partir dos destinos
  let { data: days } = await supabase.from("days").select("*").eq("trip_id", id).order("position");
  if ((!days || !days.length) && trip.start_date && trip.end_date && canEdit) {
    const n = daysBetween(trip.start_date, trip.end_date) + 1;
    const rows = Array.from({ length: Math.min(n, 60) }, (_, i) => {
      const date = addDays(trip.start_date!, i);
      const dest = destinations.find((d) => d.start_date && d.end_date && date >= d.start_date && date <= d.end_date) ?? destinations[0];
      return { trip_id: id, date, destination_id: dest?.id ?? null, title: dest ? dest.city : null, position: i };
    });
    const { data: created } = await supabase.from("days").insert(rows).select("*");
    days = created ?? [];
  }

  const [{ data: items }, { data: options }, { data: gens }] = await Promise.all([
    supabase.from("itinerary_items").select("*").eq("trip_id", id).order("position"),
    supabase.from("item_options").select("*, itinerary_items!inner(trip_id)").eq("itinerary_items.trip_id", id),
    supabase.from("ai_generations").select("output, kind").eq("trip_id", id).in("kind", ["completa", "ajuste"]).eq("status", "concluida").order("created_at", { ascending: false }).limit(1),
  ]);

  // Clima previsto (até 16 dias à frente) por destino
  const today = new Date().toISOString().slice(0, 10);
  const weatherByDate: Record<string, { rain: number | null; tmax: number | null; tmin: number | null; code: number | null }> = {};
  await Promise.all(
    destinations.filter((d) => d.lat != null && d.start_date && d.end_date && d.end_date >= today && daysBetween(today, d.start_date) <= 15).map(async (d) => {
      const s = d.start_date! < today ? today : d.start_date!;
      const e = daysBetween(today, d.end_date!) > 15 ? addDays(today, 15) : d.end_date!;
      const w = await weather(d.lat!, d.lng!, s, e);
      Object.assign(weatherByDate, w);
    }),
  );

  return (
    <Planner
      trip={trip}
      userId={user.id}
      days={(days ?? []) as Day[]}
      items={(items ?? []) as Item[]}
      options={((options ?? []) as (ItemOption & { itinerary_items?: unknown })[]).map(({ itinerary_items: _x, ...o }) => o as ItemOption)}
      destinations={destinations}
      canEdit={canEdit}
      pace={trip.pace}
      profile={prefs?.travel_profile ?? "classica"}
      weatherByDate={weatherByDate}
      initialPino={sp.pino ?? null}
      justGenerated={sp.gerado === "1"}
      lastGeneration={(gens?.[0]?.output as Record<string, unknown>) ?? null}
      initialDayId={sp.dia ?? null}
    />
  );
}
