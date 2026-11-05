import { loadTrip } from "@/lib/trip";
import { Notice } from "@/components/ui";
import { ExpensesClient, type ExpenseFull, type SettlementRow } from "@/components/expenses/expenses-client";

export const metadata = { title: "Gastos" };

export default async function GastosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, members, me, role, canSeeExpenses } = await loadTrip(id);
  if (!canSeeExpenses) {
    return (
      <Notice tone="blue">
        Os gastos desta viagem estão visíveis só para o organizador e quem ele liberou. Peça ao organizador para liberar o acesso na aba Grupo.
      </Notice>
    );
  }
  const [{ data: expenses }, { data: settlements }] = await Promise.all([
    supabase.from("expenses").select("*, expense_payers(member_id, amount_cents), expense_shares(member_id, amount_cents)").eq("trip_id", id).order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("settlements").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
  ]);
  return (
    <ExpensesClient
      trip={trip}
      members={members}
      meId={me?.id ?? null}
      canWrite={role !== "visualizador"}
      initialExpenses={(expenses ?? []) as ExpenseFull[]}
      initialSettlements={(settlements ?? []) as SettlementRow[]}
    />
  );
}
