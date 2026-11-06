import Link from "next/link";
import { loadTrip, tripPeriod, STATUS_LABEL, PROFILE_LABEL } from "@/lib/trip";
import { Avatar, Pill } from "@/components/ui";
import { memberName } from "@/lib/types";
import { TripTabs } from "./tabs";
import { DownloadPdfButton } from "@/components/export/print-button";
import { FileDown, Share2 } from "lucide-react";
import { RegenerateTrip } from "@/components/admin/regenerate-trip";

export default async function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, trip, members, prefs, role } = await loadTrip(id);
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  const initials = (trip.emoji || trip.title.slice(0, 2)).toUpperCase();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 no-print">
        <div className="hero-gradient flex h-12 w-12 items-center justify-center rounded-xl font-display text-lg font-bold text-white">{initials}</div>
        <div className="min-w-0 flex-1 basis-[calc(100%-64px)] sm:basis-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-extrabold md:text-2xl">{trip.title}</h1>
            <Pill tone="blue">{STATUS_LABEL[trip.status]}</Pill>
          </div>
          <div className="mono text-xs text-gray">
            {tripPeriod(trip)} · perfil {PROFILE_LABEL[prefs?.travel_profile ?? "classica"]}
            {trip.viability_score != null && <> · viabilidade <b className="text-navy">{trip.viability_score}</b></>}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto">
        <div className="mr-auto flex -space-x-2 sm:mr-0" aria-label="Viajantes">
          {members.slice(0, 5).map((m) => <Avatar key={m.id} name={memberName(m)} url={m.profiles?.avatar_url} size={30} />)}
        </div>
        <div className="flex flex-col items-stretch gap-1.5">
          <Link href={`/app/viagem/${id}/grupo`} className="btn-secondary btn-sm"><Share2 size={14} /> Compartilhar</Link>
          {me?.is_admin && trip.generated && <RegenerateTrip tripId={id} title={trip.title} variant="yellow" />}
        </div>
        <Link href={`/app/viagem/${id}/pdf`} className="btn-secondary btn-sm"><FileDown size={14} /> Relatório</Link>
        <DownloadPdfButton tripId={id} title={trip.title} />
        </div>
      </div>
      <TripTabs id={id} role={role} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
