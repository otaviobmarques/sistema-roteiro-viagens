import { getProfile } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { ProfileForm } from "@/components/account/profile-form";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Perfil e conta" };

export default async function ProfilePage() {
  const { supabase, user, profile } = await getProfile();
  const { data: interests } = await supabase.from("user_interests").select("category, weight").eq("user_id", user.id);
  const map: Record<string, number> = {};
  (interests ?? []).forEach((i) => { map[i.category] = i.weight; });
  return (
    <div>
      <PageTitle eyebrow="Conta" title="Perfil e conta" />
      <ProfileForm userId={user.id} email={user.email ?? ""} profile={profile as Profile} interests={map} />
    </div>
  );
}
