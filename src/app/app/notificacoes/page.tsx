import { requireUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { NotificationsList } from "@/components/account/notifications-list";
import { PushToggle } from "@/components/push-toggle";

export const metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  return (
    <div>
      <PageTitle eyebrow="Conta" title="Notificações" />
      <div className="mb-4"><PushToggle userId={user.id} /></div>
      <NotificationsList initial={data ?? []} />
    </div>
  );
}
