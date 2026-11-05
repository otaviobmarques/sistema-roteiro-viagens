import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { NewTripForm } from "./form";

export const metadata = { title: "Criar com o Pino" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; destinos?: string; dias?: string; ocasiao?: string; trip?: string; viagem?: string }> }) {
  const sp = await searchParams;
  const existing = sp.trip || sp.viagem;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) redirect(`/app/nova/${existing}`);
  const { supabase, user, profile } = await getProfile();
  const { data: interests } = await supabase.from("user_interests").select("category, weight").eq("user_id", user.id);
  return (
    <NewTripForm
      q={sp.q ?? null}
      prefill={{
        destinations: sp.destinos ? sp.destinos.split(",").map((s) => s.trim()).filter(Boolean) : [],
        days: sp.dias ? Number(sp.dias) : null,
        occasion: sp.ocasiao ?? null,
      }}
      defaults={{
        origin: profile?.home_city ?? "",
        profile: profile?.travel_profile ?? "classica",
        pace: profile?.pace ?? "equilibrado",
        interests: Object.fromEntries((interests ?? []).map((i) => [i.category, i.weight])),
      }}
    />
  );
}
