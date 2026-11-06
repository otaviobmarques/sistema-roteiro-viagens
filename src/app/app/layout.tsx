import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/supabase/server";
import { ReferralClaim } from "@/components/referral";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getProfile();
  if (profile?.suspended) redirect("/entrar?suspensa=1");
  const [{ data: wallet }, { count: unread }, { data: lastTrip }] = await Promise.all([
    supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    supabase.from("trips").select("id").neq("status", "arquivada").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return (
    <AppShell
      userName={profile?.name || user.email || "Viajante"}
      avatarUrl={profile?.avatar_url ?? null}
      credits={wallet?.balance ?? 0}
      unread={unread ?? 0}
      isAdmin={!!profile?.is_admin}
      currentTripId={lastTrip?.id ?? null}
    >
      <ReferralClaim />
      {children}
    </AppShell>
  );
}
