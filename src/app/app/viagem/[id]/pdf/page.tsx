// RF-121: roteiro para imprimir / salvar em PDF (capa, dias, horários, reservas e contatos).
import Image from "next/image";
import { loadTrip, tripPeriod, PROFILE_LABEL } from "@/lib/trip";
import { cascade } from "@/lib/domain/schedule";
import { fmtDate, fmtDuration } from "@/lib/domain/time";
import { modeLabel } from "@/lib/domain/geo";
import { fmtMoney } from "@/lib/domain/settle";
import type { Day, Item, Reservation } from "@/lib/types";
import { memberName } from "@/lib/types";
import { PrintButton } from "@/components/export/print-button";
import { fmtLocal, RES_KINDS } from "@/components/reservations/format";

export const metadata = { title: "Roteiro para imprimir" };

export default async function PdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, destinations, members, prefs } = await loadTrip(id);
  const [{ data: days }, { data: items }, { data: reservations }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("day_id", "is", null).order("position"),
    supabase.from("reservations").select("*").eq("trip_id", id).order("start_at"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray">Use “Imprimir” e escolha “Salvar como PDF”. Notas e avaliações de terceiros não entram no arquivo.</p>
        <div className="flex gap-2">
          <a className="btn-secondary btn-sm" href={`/api/trips/${id}/ics`}>Baixar calendário (.ics)</a>
          <PrintButton />
        </div>
      </div>

      <article className="space-y-6 bg-white p-6 print:p-0 md:rounded-2xl md:border md:border-line">
        <header className="border-b border-line pb-5" style={{ breakAfter: "auto" }}>
          <Image src="/brand/logo-h.png" alt="Rotta 365" width={146} height={37} />
          <h1 className="mt-6 font-display text-3xl font-extrabold">{trip.title}</h1>
          <p className="mono mt-1 text-sm text-gray">{tripPeriod(trip)} · {destinations.map((d) => d.city).join(" › ")}</p>
          <p className="mt-1 text-sm text-gray">
            {trip.travelers_adults} adulto(s){trip.travelers_children ? ` e ${trip.travelers_children} criança(s)` : ""} · perfil {PROFILE_LABEL[prefs?.travel_profile ?? "classica"]}
            {trip.viability_score != null ? ` · viabilidade ${trip.viability_score}/100` : ""}
          </p>
        </header>

        {((days ?? []) as Day[]).map((d, di) => {
          const dayItems = ((items ?? []) as Item[]).filter((i) => i.day_id === d.id);
          const res = cascade(dayItems, { date: d.date, dayStart: d.day_start || "09:00", pace: trip.pace });
          const dest = destinations.find((x) => x.id === d.destination_id);
          return (
            <section key={d.id} className="card break-inside-avoid p-4">
              <h2 className="font-display text-lg font-bold">
                <span className="mono mr-2 text-blue">Dia {di + 1}</span>{d.title || dest?.city}
              </h2>
              <p className="mb-2 text-sm text-gray">{d.date ? fmtDate(d.date, true) : ""}{dest ? ` · ${dest.city}` : ""}</p>
              {res.items.length === 0 ? <p className="text-sm text-gray">Dia livre.</p> : (
                <table className="w-full text-sm">
                  <tbody>
                    {res.items.map((it) => (
                      <tr key={it.id} className="border-t border-line align-top">
                        <td className="mono w-24 py-1.5 pr-2 font-semibold">{it.start}–{it.end}</td>
                        <td className="py-1.5">
                          <div className="font-semibold">{it.title}{it.anchor ? " (horário fixo)" : ""}</div>
                          {it.travel_before > 0 && <div className="text-xs text-gray">Chegada: {modeLabel(it.transport_mode)}, {fmtDuration(it.travel_before)}</div>}
                          {it.notes && <div className="text-xs text-gray">{it.notes}</div>}
                          {it.lat != null && <div className="mono text-[10px] text-gray">{it.lat.toFixed(5)}, {it.lng?.toFixed(5)}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}

        {!!reservations?.length && (
          <section className="card break-inside-avoid p-4">
            <h2 className="mb-2 font-display text-lg font-bold">Reservas</h2>
            <table className="w-full text-sm">
              <tbody>
                {(reservations as Reservation[]).map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="w-28 py-1.5 pr-2 text-gray">{RES_KINDS.find((k) => k.id === r.kind)?.label ?? r.kind}</td>
                    <td className="py-1.5">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-xs text-gray">
                        {r.start_at ? fmtLocal(r.start_at) : ""}{r.end_at ? ` → ${fmtLocal(r.end_at)}` : ""}
                        {r.code ? ` · código ${r.code}` : ""}{r.provider ? ` · ${r.provider}` : ""}{r.location ? ` · ${r.location}` : ""}
                      </div>
                    </td>
                    <td className="mono py-1.5 text-right">{r.value_cents != null ? fmtMoney(r.value_cents, r.currency || "BRL") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="card break-inside-avoid p-4">
          <h2 className="mb-2 font-display text-lg font-bold">Contatos</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {members.map((m) => <li key={m.id}><b>{memberName(m)}</b> · {m.role}</li>)}
          </ul>
          <p className="mt-3 text-xs text-gray">Emergência na Europa: 112 · EUA/Canadá: 911 · Brasil: 190 (polícia), 192 (SAMU). Confira os números locais do seu destino.</p>
        </section>
        <footer className="text-center text-[11px] text-gray">Gerado pelo Rotta 365 · mapas e lugares © colaboradores do OpenStreetMap</footer>
      </article>
    </div>
  );
}
