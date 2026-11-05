import { requireUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { Explorer } from "@/components/explore/explorer";

export const metadata = { title: "Explorar lugares" };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: trips }, { data: saved }] = await Promise.all([
    supabase.from("trips").select("id, title").neq("status", "arquivada").order("updated_at", { ascending: false }).limit(20),
    supabase.from("saved_places").select("place_id").eq("user_id", user.id),
  ]);
  return (
    <div>
      <PageTitle eyebrow="Planejar" title="Explorar lugares" />
      <Explorer userId={user.id} initialQuery={q ?? ""} trips={trips ?? []} savedIds={(saved ?? []).map((s) => s.place_id)} />
    </div>
  );
}
