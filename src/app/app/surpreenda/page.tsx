import { getProfile } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { Discover } from "@/components/discover/discover";

export const metadata = { title: "Me surpreenda" };

export default async function SurprisePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const { supabase, profile } = await getProfile();
  const { data: left } = await supabase.rpc("previews_left");
  return (
    <div>
      <PageTitle eyebrow="Prévia grátis" title="Não sabe para onde ir? O Pino ajuda." />
      <Discover initialTab={aba === "decidir" ? "decidir" : "surpreenda"} previewsLeft={left ?? 0} defaultProfile={profile?.travel_profile ?? "classica"} origin={profile?.home_city ?? ""} />
    </div>
  );
}
