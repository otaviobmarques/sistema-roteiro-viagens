import Link from "next/link";
import { getProfile } from "@/lib/supabase/server";
import { PinoAvatar, Stat, EmptyState, Pill } from "@/components/ui";
import { fmtBRL } from "@/lib/domain/settle";
import { daysBetween } from "@/lib/domain/time";
import { STATUS_LABEL, PROFILE_LABEL, tripPeriod } from "@/lib/trip";
import type { Trip } from "@/lib/types";
import { Compass, Plus, AlertTriangle, CheckCircle2, CalendarClock } from "lucide-react";

export const metadata = { title: "Painel" };

export default async function Dashboard() {
  const { supabase, profile } = await getProfile();
  const today = new Date().toISOString().slice(0, 10);
  const { data: tripsRaw } = await supabase.from("trips").select("*, trip_preferences(travel_profile), trip_destinations(city, position)").neq("status", "arquivada").order("start_date", { ascending: true, nullsFirst: false });
  const trips = (tripsRaw ?? []) as (Trip & { trip_preferences: { travel_profile: string } | null; trip_destinations: { city: string; position: number }[] })[];
  const upcoming = trips.filter((t) => !t.end_date || t.end_date >= today);
  const featured = upcoming[0] ?? trips[0];
  const others = trips.filter((t) => t.id !== featured?.id);
  const firstName = (profile?.name || "").split(" ")[0] || "viajante";

  type Extra = { items: number; spent: number; reservations: number; checklistDone: number; checklistTotal: number; alerts: { tone: "warn" | "ok" | "danger"; title: string; text: string; href: string }[] };
  let extra: Extra | null = null;
  if (featured) {
    const [{ count: items }, { data: exps }, { data: res }, { data: chk }, { data: must }, { count: lodging }] = await Promise.all([
      supabase.from("itinerary_items").select("id", { count: "exact", head: true }).eq("trip_id", featured.id).not("day_id", "is", null),
      supabase.from("expenses").select("amount_brl_cents").eq("trip_id", featured.id),
      supabase.from("reservations").select("id, title, free_cancel_until").eq("trip_id", featured.id),
      supabase.from("checklist_items").select("done").eq("trip_id", featured.id),
      supabase.from("trip_must_haves").select("original_text, status").eq("trip_id", featured.id),
      supabase.from("itinerary_items").select("id", { count: "exact", head: true }).eq("trip_id", featured.id).eq("kind", "hospedagem"),
    ]);
    const alerts: Extra["alerts"] = [];
    (must ?? []).filter((m) => m.status === "sem_espaco").forEach((m) => alerts.push({ tone: "danger", title: `"${m.original_text}" não coube`, text: "Decida o que tirar ou aumente a viagem.", href: `/app/viagem/${featured.id}` }));
    (res ?? []).filter((r) => r.free_cancel_until && r.free_cancel_until.slice(0, 10) >= today && daysBetween(today, r.free_cancel_until.slice(0, 10)) <= 7)
      .forEach((r) => alerts.push({ tone: "warn", title: `Cancelamento grátis de ${r.title} acaba logo`, text: `Até ${r.free_cancel_until!.slice(0, 10).split("-").reverse().join("/")}.`, href: `/app/viagem/${featured.id}/reservas` }));
    if ((items ?? 0) > 0 && (lodging ?? 0) === 0 && !(res ?? []).length) alerts.push({ tone: "warn", title: "Sem hospedagem no roteiro", text: "Adicione a reserva do hotel para eu ajustar os trajetos.", href: `/app/viagem/${featured.id}/reservas` });
    if (!(items ?? 0)) alerts.push({ tone: "warn", title: "Roteiro ainda vazio", text: "Gere com o Pino ou adicione lugares à mão.", href: featured.generated ? `/app/viagem/${featured.id}` : `/app/nova?viagem=${featured.id}` });
    if (!alerts.length) alerts.push({ tone: "ok", title: "Tudo em ordem", text: "Nenhum conflito ou pendência importante.", href: `/app/viagem/${featured.id}` });
    extra = {
      items: items ?? 0,
      spent: (exps ?? []).reduce((s, e) => s + e.amount_brl_cents, 0),
      reservations: (res ?? []).length,
      checklistDone: (chk ?? []).filter((c) => c.done).length,
      checklistTotal: (chk ?? []).length,
      alerts,
    };
  }
  const readiness = extra ? Math.round((extra.items > 0 ? 40 : 0) + (extra.reservations > 0 ? 30 : 0) + (extra.checklistTotal ? (extra.checklistDone / extra.checklistTotal) * 30 : 0)) : 0;
  const daysLeft = featured?.start_date ? daysBetween(today, featured.start_date) : null;
  const cities = featured ? [...featured.trip_destinations].sort((a, b) => a.position - b.position).map((d) => d.city) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <PinoAvatar size={44} />
        <div className="flex-1">
          <div className="label">Oi, {firstName}</div>
          <h1 className="text-2xl font-extrabold md:text-[28px]">
            {featured && daysLeft != null && daysLeft > 0 ? <>Faltam <span className="mono text-blue">{daysLeft}</span> dias para {cities[0] || featured.title}</> : featured && daysLeft != null && daysLeft <= 0 && (!featured.end_date || featured.end_date >= today) ? <>Boa viagem! Hoje é dia de {cities[0] || featured.title}</> : "Para onde vamos?"}
          </h1>
        </div>
        <Link href="/app/nova" className="btn-primary"><Plus size={16} /> Nova viagem com o Pino</Link>
      </div>

      {profile && !profile.onboarded && (
        <div className="pino-border flex flex-wrap items-center gap-3 rounded-2xl p-4">
          <PinoAvatar size={36} />
          <div className="flex-1 text-sm"><b>Me conta do que você curte?</b> Com seus interesses e perfil de gasto, os roteiros ficam com a sua cara.</div>
          <Link href="/app/onboarding" className="btn-secondary btn-sm">Completar perfil</Link>
        </div>
      )}

      {!featured ? (
        <EmptyState title="Nenhuma viagem ainda" text="Diga os destinos e eu monto a viagem: ordem, dias, lugares verificados e quanto custa." action={<div className="flex gap-2"><Link href="/app/nova" className="btn-primary">Criar com o Pino</Link><Link href="/app/surpreenda" className="btn-secondary">Me surpreenda</Link></div>} />
      ) : (
        <>
          <div className="hero-gradient grid gap-4 rounded-3xl p-5 text-white md:grid-cols-[1.4fr_1fr] md:p-6">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{STATUS_LABEL[featured.status]}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{PROFILE_LABEL[featured.trip_preferences?.travel_profile ?? "classica"]} · {featured.travelers_adults + featured.travelers_children} viajante(s)</span>
              </div>
              <h2 className="mt-3 text-2xl font-extrabold md:text-3xl">{featured.title}</h2>
              <div className="mono text-sm text-white/80">{tripPeriod(featured)} · {cities.join(" › ") || "destinos a definir"}</div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Orçamento", featured.budget_cents ? fmtBRL(featured.budget_cents, { compact: true }) : "—"], ["Gasto", fmtBRL(extra!.spent, { compact: true })], ["Reservas", String(extra!.reservations)], ["Viabilidade", featured.viability_score != null ? String(featured.viability_score) : "—"]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-white/12 px-3 py-2"><div className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{l}</div><div className="mono text-lg font-semibold">{v}</div></div>
                ))}
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs font-semibold"><span>Prontidão da viagem</span><span className="mono">{readiness}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-teal" style={{ width: `${readiness}%` }} /></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/app/viagem/${featured.id}`} className="btn rounded-xl bg-white text-blue">Abrir planejador</Link>
                <Link href={`/app/viagem/${featured.id}/hoje`} className="btn rounded-xl border border-white/40 text-white">Modo Hoje</Link>
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="label text-white/70">Alertas do Pino</div>
              <ul className="mt-2 space-y-2">
                {extra!.alerts.slice(0, 4).map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="flex gap-2 rounded-xl bg-white p-3 text-navy">
                      {a.tone === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.tone === "danger" ? "text-danger" : "text-warn"}`} />}
                      <span><span className="block text-sm font-semibold">{a.title}</span><span className="text-xs text-gray">{a.text}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Itens no roteiro" value={extra!.items} />
            <Stat label="Mala e checklist" value={`${extra!.checklistDone}/${extra!.checklistTotal}`} hint="itens prontos" />
            <Stat label="Destinos" value={cities.length} hint={cities.join(", ")} />
          </div>
        </>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold">Outras viagens</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((t) => (
            <Link key={t.id} href={`/app/viagem/${t.id}`} className="card overflow-hidden transition hover:-translate-y-0.5">
              <div className="h-16" style={{ background: `linear-gradient(135deg, ${t.cover_color || "#205BFF"}, #11C2C8)` }} />
              <div className="p-3">
                <div className="font-semibold">{t.title}</div>
                <div className="mono flex items-center gap-1 text-xs text-gray"><CalendarClock size={12} /> {tripPeriod(t)} · <Pill>{STATUS_LABEL[t.status]}</Pill></div>
              </div>
            </Link>
          ))}
          <Link href="/app/surpreenda" className="pino-border flex flex-col items-center justify-center gap-2 rounded-2xl p-5 text-center">
            <PinoAvatar mood="achei" size={40} />
            <div className="font-semibold">Me surpreenda</div>
            <div className="text-xs text-gray">O Pino sugere destinos pela ocasião</div>
            <Compass size={16} className="text-blue" />
          </Link>
        </div>
      </div>
    </div>
  );
}
