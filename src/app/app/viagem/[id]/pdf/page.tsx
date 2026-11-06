// RF-121: relatório do roteiro para imprimir / salvar em PDF (capa, visão geral, dias, reservas, checklist e contatos).
import QRCode from "qrcode";
import { loadTrip, tripPeriod, PROFILE_LABEL } from "@/lib/trip";
import { cascade } from "@/lib/domain/schedule";
import { fmtDate, fmtDuration, fmtDateShort, addDays } from "@/lib/domain/time";
import { modeLabel } from "@/lib/domain/geo";
import { transferLegs } from "@/lib/domain/multidest";
import { fmtBRL, fmtMoney } from "@/lib/domain/settle";
import { badge } from "@/lib/domain/score";
import type { Day, Item, Reservation } from "@/lib/types";
import { memberName } from "@/lib/types";
import { PrintButton } from "@/components/export/print-button";
import { fmtLocal, RES_KINDS } from "@/components/reservations/format";

// O título vira o nome do arquivo ao "Salvar como PDF"
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { trip } = await loadTrip(id);
  return { title: { absolute: `Rotta 365 – ${trip.title} – Roteiro` } };
}

const KIND_LABEL: Record<string, string> = { lugar: "Visita", atividade: "Atividade", refeicao: "Refeição", trajeto: "Trajeto", hospedagem: "Hospedagem", nota: "Nota", livre: "Tempo livre" };
const BAR = ["#205BFF", "#2F6BFF", "#0B7F84", "#0A1F4C", "#11C2C8", "#3A4D7A"];

export default async function PdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, destinations, members, prefs } = await loadTrip(id);
  const [{ data: daysRaw }, { data: itemsRaw }, { data: resRaw }, { data: must }, { data: checklist }, { data: preview }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("day_id", "is", null).order("position"),
    supabase.from("reservations").select("*").eq("trip_id", id).order("start_at"),
    supabase.from("trip_must_haves").select("original_text, status").eq("trip_id", id),
    supabase.from("checklist_items").select("label, list, done, due_date").eq("trip_id", id).eq("done", false).eq("list", "pre_viagem").limit(12),
    supabase.from("ai_generations").select("output").eq("trip_id", id).eq("kind", "previa").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const days = (daysRaw ?? []) as Day[];
  const items = (itemsRaw ?? []) as Item[];
  const reservations = (resRaw ?? []) as Reservation[];
  const people = trip.travelers_adults + trip.travelers_children;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://rotta365.vercel.app";
  const qr = await QRCode.toDataURL(`${site}/app/viagem/${id}/hoje`, { margin: 0, width: 220, color: { dark: "#0A1F4C", light: "#FFFFFF" } });
  const computed = days.map((d) => cascade(items.filter((i) => i.day_id === d.id), { date: d.date, dayStart: d.day_start || "09:00", pace: trip.pace }));
  const totalCost = computed.reduce((s, r) => s + r.costCents, 0);
  const places = items.filter((i) => i.kind !== "nota" && i.kind !== "livre" && i.kind !== "trajeto").length;
  const legs = transferLegs(destinations.filter((d) => d.lat != null).map((d) => ({ id: d.id, city: d.city, lat: d.lat!, lng: d.lng! })));
  const totalDays = destinations.reduce((s, d) => s + (d.days ?? 0), 0) || days.length;
  const summary = (preview?.output as { summary?: string } | null)?.summary;
  const occasion = (prefs as { occasion?: string | null } | null)?.occasion;
  const highlights = items
    .filter((i) => (i.kind === "lugar" || i.kind === "atividade") && i.score != null)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 6)
    .map((i) => ({ ...i, dayN: days.findIndex((d) => d.id === i.day_id) + 1 }));

  return (
    <div className="report mx-auto max-w-[820px]">
      <style>{`
        @page { size: A4; margin: 14mm 13mm 16mm; @bottom-center { content: "Rotta 365 · " counter(page) " de " counter(pages); font: 9px Manrope, sans-serif; color: #5D6477; } }
        @media print {
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          aside, header.sticky, nav { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .report { max-width: none !important; }
          .sheet { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; }
          .page-break { break-before: page; }
          .avoid { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray">Toque em “Imprimir” e escolha <b>Salvar como PDF</b>. Formato A4, uma página por dia.</p>
        <div className="flex gap-2">
          <a className="btn-secondary btn-sm" href={`/api/trips/${id}/ics`}>Calendário (.ics)</a>
          <PrintButton />
        </div>
      </div>

      {/* ---------- CAPA ---------- */}
      <section className="sheet overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-card)]">
        <div className="hero-gradient relative px-9 pb-10 pt-8 text-white">
          <div className="inline-flex rounded-xl bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Rotta 365" style={{ height: 34 }} />
          </div>
          <div className="mt-10 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">Roteiro de viagem{occasion ? ` · ${occasion}` : ""}</div>
          <h1 className="mt-2 font-display text-[44px] font-extrabold leading-[1.05]">{trip.title}</h1>
          <p className="mono mt-2 text-sm text-white/85">{tripPeriod(trip)} · {totalDays} dias · {people} viajante{people > 1 ? "s" : ""} · perfil {PROFILE_LABEL[prefs?.travel_profile ?? "classica"]}</p>
          <div className="mt-6 flex overflow-hidden rounded-xl text-[12px] font-semibold">
            {destinations.map((d, i) => (
              <div key={d.id} className="truncate px-3 py-2.5" style={{ flex: d.days ?? 1, background: i % 2 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.28)" }}>
                {d.city} · {d.days}d
              </div>
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pino.png" alt="" className="absolute bottom-0 right-8 hidden sm:block print:block" style={{ height: 150 }} />
        </div>
        <div className="grid grid-cols-2 gap-3 px-9 py-6 sm:grid-cols-4">
          {[
            ["Dias", String(totalDays)],
            ["Lugares", String(places)],
            ["Viabilidade", trip.viability_score != null ? `${trip.viability_score}/100` : "—"],
            ["Estimativa p/ pessoa", totalCost ? fmtBRL(totalCost, { compact: true }) : "—"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl border border-line px-3 py-2.5">
              <div className="label">{l}</div>
              <div className="mono text-xl font-semibold">{v}</div>
            </div>
          ))}
        </div>
        {highlights.length > 0 && (
          <div className="border-t border-line px-9 py-6">
            <div className="label mb-3">Destaques da viagem</div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {highlights.map((h, i) => (
                <li key={h.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue text-xs font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{h.title}</span>
                    <span className="mono text-[11px] text-gray">Dia {h.dayN}{h.category ? ` · ${h.category}` : ""}</span>
                  </span>
                  <span className="mono rounded-md bg-blue-50 px-1.5 text-xs font-semibold text-blue">{Number(h.score).toFixed(1)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="flex items-start gap-5 border-t border-line px-9 py-6">
          <div className="flex-1">
            <div className="label mb-1">Recado do Pino</div>
            <p className="text-[15px] leading-relaxed">{summary || "Montei cada dia com lugares reais e verificados, na ordem que economiza deslocamento. Os horários fixos estão marcados e os trajetos já estão calculados. Boa viagem!"}</p>
            <p className="mt-3 text-[11px] text-gray">Valores são estimativas e podem mudar. Confira horários de funcionamento antes de ir.</p>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR Code para abrir o roteiro" width={104} height={104} />
            <div className="mt-1 text-[10px] text-gray">Abra no celular<br />(modo Hoje)</div>
          </div>
        </div>
      </section>

      {/* ---------- VISÃO GERAL ---------- */}
      <section className="sheet page-break mt-6 rounded-3xl border border-line bg-white p-9 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Visão geral</h2>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray"><th className="pb-2">Destino</th><th className="pb-2">Período</th><th className="pb-2 text-right">Dias</th></tr></thead>
          <tbody>
            {destinations.map((d, i) => (
              <tr key={d.id} className="border-t border-line">
                <td className="py-2.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: BAR[i % BAR.length] }} /><b>{d.city}</b>{d.country ? <span className="text-gray"> · {d.country}</span> : null}</td>
                <td className="mono py-2.5 text-gray">{fmtDateShort(d.start_date)} → {fmtDateShort(d.end_date)}</td>
                <td className="mono py-2.5 text-right font-semibold">{d.days}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {legs.length > 0 && (
          <div className="mt-6">
            <div className="label mb-2">Trechos entre destinos</div>
            <ul className="space-y-1.5 text-sm">
              {legs.map((l) => (
                <li key={l.from + l.to} className="flex justify-between rounded-lg bg-ice px-3 py-2">
                  <span><b>{destinations.find((d) => d.id === l.from)?.city}</b> → <b>{destinations.find((d) => d.id === l.to)?.city}</b></span>
                  <span className="mono text-gray">{l.mode === "aviao" ? "voo" : l.mode === "onibus" ? "ônibus" : l.mode} · {fmtDuration(l.minutes)} · {l.km} km</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!must?.length && (
          <div className="mt-6">
            <div className="label mb-2">Não abro mão</div>
            <div className="flex flex-wrap gap-2">
              {must.map((m) => <span key={m.original_text} className="rounded-full border border-teal/40 bg-teal-50 px-3 py-1 text-sm">{m.original_text}{m.status === "aplicado" ? " ✓" : m.status === "sem_espaco" ? " · sem espaço" : ""}</span>)}
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="label mb-2">Dia a dia</div>
          <ol className="divide-y divide-line rounded-xl border border-line text-sm">
            {days.map((d, i) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <span className="mono w-14 font-semibold text-blue">Dia {i + 1}</span>
                <span className="mono w-24 text-gray">{d.date ? fmtDate(d.date, true) : ""}</span>
                <span className="flex-1 font-semibold">{d.title || destinations.find((x) => x.id === d.destination_id)?.city}</span>
                <span className="mono text-gray">{computed[i].items.length} parada{computed[i].items.length === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- DIAS ---------- */}
      {days.map((d, di) => {
        const res = computed[di];
        const dest = destinations.find((x) => x.id === d.destination_id);
        return (
          <section key={d.id} className="sheet page-break mt-6 rounded-3xl border border-line bg-white p-9 shadow-[var(--shadow-card)]">
            <div className="flex items-end justify-between gap-3 border-b-2 border-blue pb-3">
              <div>
                <div className="mono text-sm font-semibold text-blue">DIA {di + 1} · {d.date ? fmtDate(d.date, true).toUpperCase() : ""}</div>
                <h2 className="font-display text-[26px] font-extrabold leading-tight">{d.title || dest?.city}</h2>
                {dest && <div className="text-sm text-gray">{dest.city}{dest.country ? `, ${dest.country}` : ""}</div>}
              </div>
              <div className="mono text-right text-[11px] uppercase text-gray">
                {res.items.length} paradas<br />{res.walkKm.toFixed(1)} km a pé · {fmtDuration(res.travelMinutes)} em trajetos
              </div>
            </div>

            {res.items.length === 0 ? <p className="mt-6 text-sm text-gray">Dia livre para descansar ou explorar sem pressa.</p> : (
              <ol className="mt-5">
                {res.items.map((it, k) => {
                  const b = badge(it.score);
                  const last = k === res.items.length - 1;
                  return (
                    <li key={it.id} className="avoid relative flex gap-4 pb-4">
                      <div className="w-[68px] shrink-0 text-right">
                        <div className="mono text-[15px] font-semibold">{it.start}</div>
                        <div className="mono text-[11px] text-gray">até {it.end}</div>
                      </div>
                      <div className="relative flex w-4 shrink-0 justify-center">
                        <span className="z-10 mt-1.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: it.anchor ? "#0A1F4C" : it.kind === "refeicao" ? "#11C2C8" : "#205BFF", boxShadow: "0 0 0 2px #E3E8F2" }} />
                        {!last && <span className="absolute top-4 bottom-[-6px] w-0.5 bg-line" />}
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl border border-line px-3.5 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray">
                              {KIND_LABEL[it.kind] ?? "Visita"} · {fmtDuration(it.duration_min)}{it.anchor ? " · horário fixo" : ""}{it.must_have ? " · não abro mão" : ""}
                            </div>
                            <div className="text-[15px] font-bold leading-snug">{it.title}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            {it.score != null && <div className="mono rounded-md bg-blue-50 px-1.5 text-xs font-semibold text-blue">{Number(it.score).toFixed(1)}{b ? ` · ${b.label}` : ""}</div>}
                            {!!it.cost_cents && <div className="mono mt-0.5 text-xs text-gray">{fmtBRL(it.cost_cents)}</div>}
                          </div>
                        </div>
                        {it.why && <p className="mt-1 text-[12px] italic leading-snug text-gray">{it.why}</p>}
                        {it.notes && <p className="mt-1 text-[12px] text-navy">📝 {it.notes}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-gray">
                          {k > 0 && it.travel_before > 0 && <span>Chegada: {modeLabel(it.transport_mode)}, {fmtDuration(it.travel_before)}</span>}
                          {it.opening_hours && <span>Horário: {it.opening_hours.length > 48 ? `${it.opening_hours.slice(0, 46)}…` : it.opening_hours}</span>}
                          {it.lat != null && <a className="font-semibold text-blue" href={`https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`}>Abrir no mapa ↗</a>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {res.costCents > 0 && <div className="mono mt-2 text-right text-xs text-gray">Estimativa do dia: <b className="text-navy">{fmtBRL(res.costCents)}</b> por pessoa</div>}
          </section>
        );
      })}

      {/* ---------- RESERVAS, CHECKLIST E CONTATOS ---------- */}
      <section className="sheet page-break mt-6 space-y-7 rounded-3xl border border-line bg-white p-9 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Reservas</h2>
          {!reservations.length ? <p className="mt-2 text-sm text-gray">Nenhuma reserva cadastrada ainda. Adicione na aba Reservas e elas aparecem aqui com códigos e horários.</p> : (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="avoid border-t border-line align-top">
                    <td className="w-28 py-2.5 pr-2 text-[11px] font-semibold uppercase tracking-wider text-gray">{RES_KINDS.find((k) => k.id === r.kind)?.label ?? r.kind}</td>
                    <td className="py-2.5">
                      <div className="font-bold">{r.title}</div>
                      <div className="text-xs text-gray">{r.start_at ? fmtLocal(r.start_at) : ""}{r.end_at ? ` → ${fmtLocal(r.end_at)}` : ""}{r.location ? ` · ${r.location}` : ""}</div>
                      {r.free_cancel_until && <div className="text-xs text-warn">Cancelamento grátis até {fmtLocal(r.free_cancel_until)}</div>}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.code && <div className="mono rounded-md bg-ice px-2 py-0.5 text-sm font-semibold">{r.code}</div>}
                      {r.value_cents != null && <div className="mono mt-1 text-xs text-gray">{fmtMoney(r.value_cents, r.currency || "BRL")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!!checklist?.length && (
          <div className="avoid">
            <h2 className="font-display text-xl font-extrabold">Antes de sair</h2>
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              {checklist.map((c) => <li key={c.label} className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded border border-gray/50" />{c.label}{c.due_date ? <span className="mono text-xs text-gray">até {fmtDateShort(c.due_date)}</span> : null}</li>)}
            </ul>
          </div>
        )}

        <div className="avoid grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-extrabold">Viajantes</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {members.map((m) => <li key={m.id}><b>{memberName(m)}</b> <span className="text-gray">· {m.role}</span></li>)}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold">Emergência</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li><b className="mono">112</b> <span className="text-gray">· Europa (polícia, ambulância, bombeiros)</span></li>
              <li><b className="mono">911</b> <span className="text-gray">· Estados Unidos e Canadá</span></li>
              <li><b className="mono">190 · 192 · 193</b> <span className="text-gray">· Brasil (polícia, SAMU, bombeiros)</span></li>
              <li className="text-gray">Consulados do Brasil no exterior: gov.br/mre</li>
            </ul>
          </div>
        </div>
        <footer className="border-t border-line pt-4 text-center text-[10px] text-gray">
          Gerado pelo Rotta 365 em {fmtDate(addDays(new Date().toISOString().slice(0, 10), 0))} · lugares e mapas © colaboradores do OpenStreetMap e Wikidata · rotta365.com.br
        </footer>
      </section>
    </div>
  );
}
