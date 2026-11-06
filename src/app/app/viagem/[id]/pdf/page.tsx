// RF-121: relatório do roteiro para imprimir / salvar em PDF (capa, visão geral, dias, reservas, checklist e contatos).
import QRCode from "qrcode";
import { loadTrip, tripPeriod, PROFILE_LABEL } from "@/lib/trip";
import { cascade } from "@/lib/domain/schedule";
import { fmtDate, fmtDuration, fmtDateShort, addDays } from "@/lib/domain/time";
import { modeLabel, mapsRouteUrl } from "@/lib/domain/geo";
import { transferLegs } from "@/lib/domain/multidest";
import { fmtBRL, fmtMoney } from "@/lib/domain/settle";
import { badge } from "@/lib/domain/score";
import type { Day, Item, Reservation } from "@/lib/types";
import { memberName } from "@/lib/types";
import { PrintButton, DownloadPdfButton } from "@/components/export/print-button";
import { countryGuides, type CountryGuide, type Affiliates } from "@/lib/ai/country-guide";
import { fmtLocal, RES_KINDS } from "@/components/reservations/format";

// O título vira o nome do arquivo ao "Salvar como PDF"
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { trip } = await loadTrip(id);
  return { title: { absolute: `Rotta 365 – ${trip.title} – Roteiro` } };
}

const KIND_LABEL: Record<string, string> = { lugar: "Visita", atividade: "Atividade", refeicao: "Refeição", trajeto: "Trajeto", hospedagem: "Hospedagem", nota: "Nota", livre: "Tempo livre" };
// "Mo-Su 11:00-23:30" (formato do OpenStreetMap) -> "todos os dias 11:00–23:30"
const DAY_PT: Record<string, string> = { Mo: "seg", Tu: "ter", We: "qua", Th: "qui", Fr: "sex", Sa: "sáb", Su: "dom", PH: "feriados" };
function humanHours(oh: string): string {
  let t = oh.trim().replace(/\bMo-Su\b/g, "todos os dias").replace(/\b24\/7\b/, "aberto 24h");
  t = t.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAY_PT[d]);
  t = t.replace(/(seg|ter|qua|qui|sex|sáb|dom)-(seg|ter|qua|qui|sex|sáb|dom)/g, "$1 a $2");
  t = t.replace(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g, "$1–$2").replace(/\boff\b/gi, "fechado").replace(/\s*;\s*/g, " · ").replace(/,(?=\S)/g, ", ");
  return t.length > 60 ? `${t.slice(0, 58)}…` : t;
}
const fmtKm = (km: number) => km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtReais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0, minimumFractionDigits: 0 });
// custo do dia por tipo (por pessoa)
type CostSplit = { comida: number; passeios: number; hospedagem: number; transporte: number };
function splitCosts(items: { kind: string; cost_cents?: number | null; transit_cost_cents?: number | null }[]): CostSplit {
  const c: CostSplit = { comida: 0, passeios: 0, hospedagem: 0, transporte: 0 };
  for (const it of items) {
    const v = Number(it.cost_cents || 0);
    if (it.kind === "refeicao") c.comida += v;
    else if (it.kind === "hospedagem") c.hospedagem += v;
    else if (it.kind === "trajeto") c.transporte += v;
    else c.passeios += v;
    c.transporte += Number(it.transit_cost_cents || 0);
  }
  return c;
}
const SPLIT_LABEL: [keyof CostSplit, string][] = [["comida", "Alimentação"], ["passeios", "Passeios e ingressos"], ["hospedagem", "Hospedagem"], ["transporte", "Transporte"]];

// seta em SVG: as fontes do servidor de PDF não têm o caractere →
const Arrow = () => <svg width="12" height="10" viewBox="0 0 12 10" className="inline-block align-middle" aria-hidden><path d="M1 5h9M6.5 1.5 10 5 6.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function GuideCard({ title, badge, strong, children }: { title: string; badge?: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="avoid rounded-xl border border-line p-3.5 text-[12px] leading-snug text-navy">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold">{title}</h3>
        {badge && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${strong ? "bg-warn-50 text-warn" : "bg-blue-50 text-blue"}`}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}
const PartnerLink = ({ url, label }: { url: string; label: string }) => (
  <a href={url} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue px-2.5 py-1.5 text-[11px] font-semibold text-white">{label} <span className="rounded bg-white/20 px-1 text-[9px] uppercase tracking-wide">parceiro</span></a>
);

const isBrazil = (c?: string | null) => !c || /^(brasil|brazil|br)$/i.test(c.trim());
const isNorthAmerica = (c?: string | null) => !!c && /estados unidos|eua|usa|united states|canad/i.test(c);

const BAR = ["#205BFF", "#2F6BFF", "#0B7F84", "#0A1F4C", "#11C2C8", "#3A4D7A"];

export default async function PdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, trip, destinations, members, prefs } = await loadTrip(id);
  const [{ data: daysRaw }, { data: itemsRaw }, { data: resRaw }, { data: must }, { data: checklist }, { data: preview }] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("day_id", "is", null).order("position"),
    supabase.from("reservations").select("*").eq("trip_id", id).order("start_at"),
    supabase.from("trip_must_haves").select("original_text, status").eq("trip_id", id),
    supabase.from("checklist_items").select("label, list, category, done, due_date, position").eq("trip_id", id).order("position").limit(200),
    supabase.from("ai_generations").select("output").eq("trip_id", id).eq("kind", "previa").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const days = (daysRaw ?? []) as Day[];
  const items = (itemsRaw ?? []) as Item[];
  const reservations = (resRaw ?? []) as Reservation[];
  const people = trip.travelers_adults + trip.travelers_children;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://rotta365.vercel.app";
  const { data: owner } = await supabase.from("profiles").select("name, referral_code").eq("id", trip.owner_id).maybeSingle();
  const referralUrl = owner?.referral_code ? `${site}/r/${owner.referral_code}` : site;
  // guia "antes de ir" (cache; se faltar, gera na hora, com limite de tempo)
  const [guides, { data: affRow }] = await Promise.all([
    Promise.race([
      countryGuides(supabase, destinations.map((d) => d.country)),
      new Promise<{ country: string; guide: CountryGuide }[]>((r) => setTimeout(() => r([]), 25000)),
    ]),
    supabase.from("app_settings").select("value").eq("key", "affiliates").maybeSingle(),
  ]);
  const aff = (affRow?.value ?? {}) as Affiliates;
  const referralQr = await QRCode.toDataURL(referralUrl, { margin: 0, width: 220, color: { dark: "#0A1F4C", light: "#FFFFFF" } });
  const qr = await QRCode.toDataURL(`${site}/app/viagem/${id}/hoje`, { margin: 0, width: 220, color: { dark: "#0A1F4C", light: "#FFFFFF" } });
  const computed = days.map((d) => cascade(items.filter((i) => i.day_id === d.id), { date: d.date, dayStart: d.day_start || "09:00", pace: trip.pace }));
  const daySplits = computed.map((r) => splitCosts(r.items as unknown as Item[]));
  const tripSplit = daySplits.reduce((a, c) => ({ comida: a.comida + c.comida, passeios: a.passeios + c.passeios, hospedagem: a.hospedagem + c.hospedagem, transporte: a.transporte + c.transporte }), { comida: 0, passeios: 0, hospedagem: 0, transporte: 0 });
  const totalCost = tripSplit.comida + tripSplit.passeios + tripSplit.hospedagem + tripSplit.transporte;
  const places = items.filter((i) => i.kind !== "nota" && i.kind !== "livre" && i.kind !== "trajeto").length;
  const legs = transferLegs(destinations.filter((d) => d.lat != null).map((d) => ({ id: d.id, city: d.city, lat: d.lat!, lng: d.lng! })));
  const totalDays = destinations.reduce((s, d) => s + (d.days ?? 0), 0) || days.length;
  const summary = (preview?.output as { summary?: string } | null)?.summary;
  const occasionRaw = (prefs as { occasion?: string | null } | null)?.occasion;
  // não mostra "sozinho" quando a viagem tem mais de uma pessoa
  const occasion = occasionRaw && /sozinh/i.test(occasionRaw) && people > 1 ? null : occasionRaw;
  const abroad = destinations.filter((d) => !isBrazil(d.country));
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
          .keep-with-prev { break-before: avoid; }
          .report { zoom: 0.9; }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray">Relatório em A4, uma página por dia. Use <b>Baixar PDF</b> para salvar ou enviar pelo WhatsApp.</p>
        <div className="flex flex-wrap items-start gap-2">
          <a className="btn-secondary btn-sm" href={`/api/trips/${id}/ics`}>Calendário (.ics)</a>
          <PrintButton />
          <DownloadPdfButton tripId={id} title={trip.title} />
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
          <h1 className="mt-2 pr-0 sm:pr-44 print:pr-44 font-display text-[44px] font-extrabold leading-[1.05]">{trip.title}</h1>
          <p className="mono mt-2 pr-0 text-sm text-white/85 sm:pr-44 print:pr-44">{tripPeriod(trip).replace("→", "a")} · {totalDays} dias · {people} viajante{people > 1 ? "s" : ""} · perfil {PROFILE_LABEL[prefs?.travel_profile ?? "classica"]}</p>
          <div className="mt-6 flex overflow-hidden rounded-xl text-[12px] font-semibold sm:mr-44 print:mr-44">
            {destinations.map((d, i) => (
              <div key={d.id} className="truncate px-3 py-2.5" style={{ flex: d.days ?? 1, background: i % 2 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.28)" }}>
                {d.city} · {d.days}d
              </div>
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pino.png" alt="" className="absolute bottom-0 right-8 hidden sm:block print:block" style={{ height: 150 }} />
        </div>
        <div className="grid grid-cols-2 gap-3 px-9 py-6 sm:grid-cols-4 print:grid-cols-4">
          {[
            ["Dias", String(totalDays)],
            ["Lugares", String(places)],
            ["Viabilidade", trip.viability_score != null ? `${trip.viability_score}/100` : "—"],
            ["Estimativa p/ pessoa", totalCost ? fmtReais(totalCost) : "—"],
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
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
              {highlights.map((h, i) => (
                <li key={h.id} className="avoid flex min-w-0 items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue text-xs font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{h.title}</span>
                    <span className="mono text-[11px] text-gray">Dia {h.dayN}{h.category ? ` · ${h.category}` : ""}</span>
                  </span>
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
                <td className="mono py-2.5 text-gray">{fmtDateShort(d.start_date)} a {fmtDateShort(d.end_date)}</td>
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
                  <span><b>{destinations.find((d) => d.id === l.from)?.city}</b> <Arrow /> <b>{destinations.find((d) => d.id === l.to)?.city}</b></span>
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

        {totalCost > 0 && (
          <div className="avoid mt-6">
            <div className="label mb-2">Quanto custa (estimativa por pessoa)</div>
            <table className="w-full overflow-hidden rounded-xl border border-line text-sm">
              <tbody className="divide-y divide-line">
                {SPLIT_LABEL.filter(([k]) => tripSplit[k] > 0).map(([k, l]) => (
                  <tr key={k}><td className="px-3 py-2">{l}</td><td className="mono px-3 py-2 text-right">{fmtBRL(tripSplit[k])}</td><td className="mono w-16 px-3 py-2 text-right text-gray">{Math.round((tripSplit[k] / totalCost) * 100)}%</td></tr>
                ))}
                <tr className="bg-ice font-bold"><td className="px-3 py-2">Total da viagem</td><td className="mono px-3 py-2 text-right">{fmtBRL(totalCost)}</td><td /></tr>
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] text-gray">Hospedagem por noite e por quarto, conforme o perfil escolhido. Passagens aéreas não estão incluídas.</p>
          </div>
        )}
      </section>

      {/* ---------- ANTES DE IR (por país) ---------- */}
      {guides.map(({ country, guide: g }) => (
        <section key={country} className="sheet page-break mt-6 rounded-3xl border border-line bg-white p-9 shadow-[var(--shadow-card)]">
          <div className="label text-blue">Antes de ir</div>
          <h2 className="font-display text-2xl font-extrabold">{country}: o que preparar</h2>
          <p className="mt-1 text-xs text-gray">Regras de entrada, acordos e preços mudam. Confirme nos sites oficiais (consulado e gov.br/mre) antes de viajar.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
            <GuideCard title="Seguro viagem" badge={g.insurance.mandatory ? "Obrigatório" : "Recomendado"} strong={g.insurance.mandatory}>
              <p><b>{g.insurance.requirement}</b></p>
              <p className="mt-1">{g.insurance.recommended}</p>
              {g.insurance.tips.slice(0, 3).map((t) => <p key={t} className="mt-1">• {t}</p>)}
              {aff.seguro?.url && <PartnerLink url={aff.seguro.url} label={aff.seguro.label || "Cotar seguro viagem"} />}
            </GuideCard>
            <GuideCard title="Saúde">
              <p>{g.health.summary}</p>
              {g.health.agreement && <p className="mt-1"><b>Acordo Brasil–{country}:</b> {g.health.agreement}</p>}
              <p className="mt-1"><b>Vacinas:</b> {g.health.vaccines}</p>
              <p className="mt-1"><b>Remédios:</b> {g.health.medicines}</p>
            </GuideCard>
            <GuideCard title="Celular e internet">
              <p><b>Roaming:</b> {g.connectivity.roaming}</p>
              <p className="mt-1"><b>eSIM:</b> {g.connectivity.esim}</p>
              <p className="mt-1"><b>Chip local:</b> {g.connectivity.local_sim}</p>
              <p className="mt-1">• {g.connectivity.tip}</p>
              {aff.esim?.url && <PartnerLink url={aff.esim.url} label={aff.esim.label || "Comprar eSIM de viagem"} />}
            </GuideCard>
            <GuideCard title="Documentos e visto">
              <p>{g.documents.visa}</p>
              <p className="mt-1"><b>Passaporte:</b> {g.documents.passport}</p>
              {g.documents.other && <p className="mt-1">{g.documents.other}</p>}
            </GuideCard>
            <GuideCard title="Dinheiro e gorjeta">
              <p><b>Moeda:</b> {g.money.currency}</p>
              <p className="mt-1">{g.money.cards}</p>
              <p className="mt-1"><b>Gorjeta:</b> {g.money.tipping}</p>
            </GuideCard>
            <GuideCard title="Tomada e emergência">
              <p><b>Tomada:</b> {g.power.plugs} · {g.power.voltage}</p>
              <p className="mt-1"><b>Emergência:</b> {g.emergency.number}{g.emergency.police ? ` · polícia ${g.emergency.police}` : ""}{g.emergency.ambulance ? ` · ambulância ${g.emergency.ambulance}` : ""}</p>
            </GuideCard>
          </div>
          {g.phrases.length > 0 && (
            <div className="avoid mt-4">
              <div className="label mb-2">Frases úteis</div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 print:grid-cols-2">
                {g.phrases.slice(0, 6).map((f) => <div key={f.pt} className="flex justify-between gap-3 border-b border-line py-1"><span className="text-gray">{f.pt}</span><b>{f.local}</b></div>)}
              </div>
            </div>
          )}
          {(aff.seguro?.url || aff.esim?.url) && <p className="mt-4 text-[10px] text-gray">Links marcados como “parceiro” podem gerar comissão para o Rotta 365, sem custo extra para você.</p>}
        </section>
      ))}

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
                {res.items.length} paradas<br />{[res.walkKm >= 0.1 ? `${fmtKm(res.walkKm)} km a pé` : null, res.travelMinutes > 0 ? `${fmtDuration(res.travelMinutes)} em trajetos` : null].filter(Boolean).join(" · ")}
              </div>
            </div>

            {res.items.length === 0 ? <p className="mt-6 text-sm text-gray">Dia livre para descansar ou explorar sem pressa.</p> : (
              <ol className="mt-5">
                {res.items.map((it, k) => {
                  const b = badge(it.score);
                  const last = k === res.items.length - 1;
                  return (
                    <li key={it.id} className="avoid relative flex gap-4 pb-3">
                      <div className="w-[68px] shrink-0 text-right">
                        <div className="mono text-[15px] font-semibold">{it.start}</div>
                        <div className="mono text-[11px] text-gray">até {it.end}</div>
                      </div>
                      <div className="relative flex w-4 shrink-0 justify-center">
                        <span className="z-10 mt-1.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: it.anchor ? "#0A1F4C" : it.kind === "refeicao" ? "#11C2C8" : "#205BFF", boxShadow: "0 0 0 2px #E3E8F2" }} />
                        {!last && <span className="absolute top-4 bottom-[-6px] w-0.5 bg-line" />}
                      </div>
                      <div className="min-w-0 flex-1">
                      {k > 0 && it.travel_before > 0 && (() => {
                        const prev = res.items[k - 1];
                        const tipOk = it.transit_tip && it.transit_from === prev?.title;
                        return (
                          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 rounded-lg bg-ice px-2.5 py-1.5 text-[11px] text-gray">
                            <span className="font-semibold text-navy">Como chegar · {modeLabel(it.transport_mode)}, {fmtDuration(it.travel_before)}{tipOk && it.transit_cost_cents ? ` · ~${fmtBRL(it.transit_cost_cents)}` : ""}</span>
                            {tipOk && <span>{it.transit_tip}</span>}
                            {prev?.lat != null && it.lat != null && <a className="font-semibold text-blue" href={mapsRouteUrl({ lat: prev.lat!, lng: prev.lng! }, { lat: it.lat!, lng: it.lng! }, it.transport_mode)}>Ver rota agora</a>}
                          </div>
                        );
                      })()}
                      <div className="flex gap-3 rounded-xl border border-line px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray">
                              {KIND_LABEL[it.kind] ?? "Visita"} · {fmtDuration(it.duration_min)}{it.anchor ? " · horário fixo" : ""}{it.must_have ? " · não abro mão" : ""}
                            </div>
                            <div className="text-[15px] font-bold leading-snug">{it.title}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            {b && <div className="rounded-md bg-blue-50 px-1.5 text-xs font-semibold text-blue">{b.label}</div>}
                            {!!it.cost_cents && <div className="mono mt-0.5 text-xs text-gray">{fmtBRL(it.cost_cents)}</div>}
                          </div>
                        </div>
                        {it.why && <p className="mt-1 text-[12px] italic leading-snug text-gray">{it.why}</p>}
                        {it.notes && <p className="mt-1 text-[12px] text-navy"><b>Nota:</b> {it.notes}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-gray">
                          {it.opening_hours && <span>Horário: {humanHours(it.opening_hours)}</span>}
                          {it.lat != null && <a className="font-semibold text-blue" href={`https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`}>Abrir no mapa</a>}
                        </div>
                      </div>
                      {it.photo_url && (
                        <figure className="w-[118px] shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.photo_url} alt={it.title} className="h-[84px] w-[118px] rounded-lg object-cover" loading="eager" />
                          {it.photo_credit && <figcaption className="mt-0.5 line-clamp-2 text-[7px] leading-tight text-gray">{it.photo_credit}</figcaption>}
                        </figure>
                      )}
                      </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {(() => {
              const sp = daySplits[di];
              const tot = sp.comida + sp.passeios + sp.hospedagem + sp.transporte;
              if (!tot) return null;
              return (
                <div className="keep-with-prev mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-gray">
                  {SPLIT_LABEL.filter(([k]) => sp[k] > 0).map(([k, l]) => <span key={k}>{l}: <b className="mono text-navy">{fmtBRL(sp[k])}</b></span>)}
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue">Total do dia: <b className="mono">{fmtBRL(tot)}</b> por pessoa</span>
                </div>
              );
            })()}
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
                      <div className="text-xs text-gray">{r.start_at ? fmtLocal(r.start_at) : ""}{r.end_at ? ` até ${fmtLocal(r.end_at)}` : ""}{r.location ? ` · ${r.location}` : ""}</div>
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
              {guides.map(({ country, guide: g }) => <li key={country}><b className="mono">{g.emergency.number}</b> <span className="text-gray">· {country}{g.emergency.police ? ` (polícia ${g.emergency.police})` : ""}{g.emergency.ambulance ? ` (ambulância ${g.emergency.ambulance})` : ""}</span></li>)}
              {destinations.some((d) => isBrazil(d.country)) && <li><b className="mono">190 · 192 · 193</b> <span className="text-gray">· Brasil (polícia, SAMU, bombeiros)</span></li>}
              {!guides.length && abroad.some((d) => isNorthAmerica(d.country)) && <li><b className="mono">911</b> <span className="text-gray">· Estados Unidos e Canadá</span></li>}
              {!guides.length && abroad.some((d) => !isNorthAmerica(d.country)) && <li><b className="mono">112</b> <span className="text-gray">· emergência na Europa e em muitos outros países</span></li>}
              {abroad.length > 0 && <li className="text-gray">Consulados do Brasil no exterior: gov.br/mre</li>}
            </ul>
          </div>
        </div>
        <footer className="border-t border-line pt-4 text-center text-[10px] text-gray">
          Gerado pelo Rotta 365 em {fmtDate(addDays(new Date().toISOString().slice(0, 10), 0))} · lugares e mapas © colaboradores do OpenStreetMap e Wikidata · rotta365.com.br
        </footer>
      </section>

      {/* ---------- BÔNUS: CHECKLIST DE VIAGEM ---------- */}
      {!!checklist?.length && (() => {
        const groups = (list: string) => {
          const m = new Map<string, NonNullable<typeof checklist>>();
          checklist.filter((c) => c.list === list).forEach((c) => m.set(c.category || "Geral", [...(m.get(c.category || "Geral") ?? []), c]));
          return [...m.entries()];
        };
        const Box = ({ c }: { c: NonNullable<typeof checklist>[number] }) => (
          <li className="flex items-start gap-2 py-1">
            <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${c.done ? "border-ok bg-ok text-white" : "border-gray/60"}`}>{c.done && <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden><path d="M1 4l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>}</span>
            <span className="flex-1">{c.label}</span>
            {c.due_date && !c.done && <span className="mono shrink-0 text-[10px] text-gray">até {fmtDateShort(c.due_date)}</span>}
          </li>
        );
        return (
          <section className="sheet page-break mt-6 rounded-3xl border border-line bg-white p-9 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2"><span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#0b7f84]">Bônus</span><span className="label">Feito para a sua viagem</span></div>
            <h2 className="mt-1 font-display text-2xl font-extrabold">Checklist de viagem</h2>
            <p className="mt-1 text-sm text-gray">O que resolver antes de ir, com o prazo ideal de cada item. Ele também está no app, na aba Mala e checklist, para ir marcando.</p>
            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 print:grid-cols-2">
              {groups("pre_viagem").map(([cat, list]) => (
                <div key={cat} className="avoid">
                  <h3 className="text-sm font-extrabold text-blue">{cat}</h3>
                  <ul className="mt-1 text-[12px] leading-snug">{list.map((c) => <Box key={c.label} c={c} />)}</ul>
                </div>
              ))}
            </div>
            {groups("mala").length > 0 && (
              <div className="avoid mt-6 border-t border-line pt-4">
                <h3 className="font-display text-lg font-extrabold">Mala</h3>
                <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
                  {groups("mala").map(([cat, list]) => (
                    <div key={cat} className="avoid">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray">{cat}</h4>
                      <ul className="mt-1 text-[12px] leading-snug">{list.map((c) => <Box key={c.label} c={c} />)}</ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* ---------- OBRIGADO + INDICAÇÃO ---------- */}
      <section className="sheet page-break mt-6 overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-card)]">
        <div className="hero-gradient relative px-9 pb-9 pt-10 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">Obrigado por viajar com a gente</div>
          <h2 className="mt-2 pr-0 font-display text-[34px] font-extrabold leading-tight sm:pr-44 print:pr-44">Boa viagem{owner?.name ? `, ${owner.name.split(" ")[0]}` : ""}!</h2>
          <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-white/90">Foi um prazer montar este roteiro com você. Aproveite cada parada, e se algo mudar no caminho, é só me chamar no app que eu reorganizo o dia na hora.</p>
          <p className="mt-2 text-sm text-white/80">— Pino, do Rotta 365</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pino.png" alt="" className="absolute bottom-0 right-8 hidden sm:block print:block" style={{ height: 150 }} />
        </div>
        <div className="flex items-center gap-6 px-9 py-8">
          <div className="flex-1">
            <div className="label mb-1">Indique o Rotta 365</div>
            <h3 className="font-display text-2xl font-extrabold leading-tight">Gostou? Indique para um amigo e <span className="text-blue">os dois ganham um roteiro grátis.</span></h3>
            <p className="mt-2 text-sm text-gray">Quem você indicar ganha 1 crédito extra na primeira compra, e você ganha 1 crédito também. É só compartilhar o seu link ou este QR Code.</p>
            <div className="mono mt-3 inline-block rounded-lg bg-ice px-3 py-2 text-sm font-semibold text-navy">{referralUrl.replace(/^https?:\/\//, "")}</div>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referralQr} alt="QR Code do link de indicação" width={128} height={128} />
            <div className="mt-1 text-[10px] text-gray">Aponte a câmera</div>
          </div>
        </div>
        <div className="border-t border-line px-9 py-4 text-center text-[11px] text-gray">Sua opinião ajuda muito: conte como foi a viagem respondendo a notificação do app ou pelo rotta365.com.br.</div>
      </section>
    </div>
  );
}
