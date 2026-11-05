import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// RF-005 (LGPD): exportação dos dados do próprio usuário em JSON.
export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login necessário" }, { status: 401 });
  const uid = auth.user.id;

  const [profile, interests, memberships, wallet, txs, orders, saved, notifications] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("user_interests").select("*").eq("user_id", uid),
    supabase.from("trip_members").select("trip_id, role, joined_at").eq("user_id", uid),
    supabase.from("credit_wallets").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("credit_transactions").select("*").eq("user_id", uid),
    supabase.from("orders").select("id, product_id, amount_cents, method, status, created_at, paid_at").eq("user_id", uid),
    supabase.from("saved_places").select("*, places(name, city, lat, lng)").eq("user_id", uid),
    supabase.from("notifications").select("*").eq("user_id", uid),
  ]);
  const tripIds = (memberships.data ?? []).map((m) => m.trip_id);
  const [trips, days, items, reservations, expenses] = tripIds.length
    ? await Promise.all([
        supabase.from("trips").select("*").in("id", tripIds),
        supabase.from("days").select("*").in("trip_id", tripIds),
        supabase.from("itinerary_items").select("*").in("trip_id", tripIds),
        supabase.from("reservations").select("*").in("trip_id", tripIds),
        supabase.from("expenses").select("*, expense_payers(*), expense_shares(*)").in("trip_id", tripIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: uid, email: auth.user.email, created_at: auth.user.created_at },
    profile: profile.data,
    interests: interests.data,
    wallet: wallet.data,
    credit_transactions: txs.data,
    orders: orders.data,
    saved_places: saved.data,
    notifications: notifications.data,
    trips: (trips.data ?? []).map((t) => ({
      ...t,
      my_role: memberships.data?.find((m) => m.trip_id === t.id)?.role,
      days: (days.data ?? []).filter((d) => d.trip_id === t.id),
      items: (items.data ?? []).filter((i) => i.trip_id === t.id),
      reservations: (reservations.data ?? []).filter((r) => r.trip_id === t.id),
      expenses: (expenses.data ?? []).filter((e) => e.trip_id === t.id),
    })),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rotta365-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
