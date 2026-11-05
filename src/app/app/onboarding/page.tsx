import { getProfile } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Boas-vindas" };

export default async function Page() {
  const { supabase, user, profile } = await getProfile();
  const { data: interests } = await supabase.from("user_interests").select("category, weight").eq("user_id", user.id);
  return (
    <Onboarding
      initial={{
        name: profile?.name ?? "",
        home_city: profile?.home_city ?? "",
        travel_profile: profile?.travel_profile ?? "classica",
        pace: profile?.pace ?? "equilibrado",
        interests: Object.fromEntries((interests ?? []).map((i) => [i.category, i.weight])),
      }}
    />
  );
}
