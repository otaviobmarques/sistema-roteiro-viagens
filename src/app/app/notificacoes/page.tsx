import { requireUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { NotificationsList } from "@/components/account/notifications-list";

export const metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  return (
    <div>
      <PageTitle eyebrow="Conta" title="Notificações" />
      <NotificationsList initial={data ?? []} />
    </div>
  );
}
