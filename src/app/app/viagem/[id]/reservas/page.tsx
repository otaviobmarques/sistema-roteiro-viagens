import { loadTrip } from "@/lib/trip";
import type { Reservation } from "@/lib/types";
import { ReservationsClient } from "@/components/reservations/reservations-client";

export const metadata = { title: "Reservas" };

export default async function ReservasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, members, me, canEdit, canSeeExpenses } = await loadTrip(id);
  const [{ data: reservations }, { data: days }, { data: expenses }] = await Promise.all([
    supabase.from("reservations").select("*").eq("trip_id", id).order("start_at", { ascending: true, nullsFirst: false }),
    supabase.from("days").select("id, date, position").eq("trip_id", id).order("position"),
    canSeeExpenses ? supabase.from("expenses").select("id, reservation_id").eq("trip_id", id).not("reservation_id", "is", null) : Promise.resolve({ data: [] as { id: string; reservation_id: string }[] }),
  ]);
  return (
    <ReservationsClient
      tripId={id}
      inbox={`${trip.inbox_alias}@reservas.rotta365.app`}
      reservations={(reservations ?? []) as Reservation[]}
      days={(days ?? []) as { id: string; date: string | null; position: number }[]}
      members={members.map((m) => ({ id: m.id, user_id: m.user_id }))}
      myMemberId={me?.id ?? null}
      canEdit={canEdit}
      canSeeExpenses={canSeeExpenses}
      linkedExpenses={(expenses ?? []) as { id: string; reservation_id: string }[]}
      tripCurrency={trip.currency}
      tripStart={trip.start_date}
      tripEnd={trip.end_date}
    />
  );
}
