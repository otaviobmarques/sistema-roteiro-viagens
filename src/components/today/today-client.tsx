"use client";
// Tela Hoje (RF-100, RF-101, RF-105): próximo compromisso, hora de sair, navegação, resto do dia, fuso e moeda.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, Clock, CloudRain, Navigation, Car, MapPin, ArrowRightLeft, CalendarDays, Anchor } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Day, Item } from "@/lib/types";
import { cascade } from "@/lib/domain/schedule";
import { daysBetween, fmtDate, fmtDuration, fromMin, toMin } from "@/lib/domain/time";
import { modeLabel } from "@/lib/domain/geo";
import { countryCode, CURRENCY_BY_COUNTRY, weatherLabel } from "@/lib/context";
import { EmptyState, PinoAvatar, Pill } from "@/components/ui";

type Dest = { id: string; city: string; country: string | null; lat: number | null; lng: number | null };

function localNow(tz: string | null) {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hh = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(hh) * 60 + Number(get("minute")), hhmm: `${hh}:${get("minute")}` };
}

function navLinks(it: { lat: number | null; lng: number | null; title: string }) {
  if (it.lat == null || it.lng == null) {
    const q = encodeURIComponent(it.title);
    return { google: `https://www.google.com/maps/search/?api=1&query=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes`, apple: `https://maps.apple.com/?q=${q}`, uber: null as string | null };
  }
  const ll = `${it.lat},${it.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${ll}`,
    uber: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${it.lat}&dropoff[longitude]=${it.lng}&dropoff[nickname]=${encodeURIComponent(it.title)}`,
  };
}

export function TodayClient({ tripId, tripTitle, pace, days, items: initialItems, destinations, canEdit }: {
  tripId: string; tripTitle: string; pace: string; days: Day[]; items: Item[]; destinations: Dest[]; canEdit: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [tz, setTz] = useState<string | null>(null);
  const [now, setNow] = useState(() => localNow(null));
  const [wx, setWx] = useState<{ tmax: number; tmin: number; rain: number; code: number } | null>(null);
  const [fx, setFx] = useState<number | null>(null);
  const [amount, setAmount] = useState("10");

  const dated = days.filter((d) => d.date);
  const first = dated[0]?.date ?? null;
  const last = dated[dated.length - 1]?.date ?? null;
  const today = now.date;
  const state: "antes" | "durante" | "depois" | "sem_datas" = !first ? "sem_datas" : today < first ? "antes" : last && today > last ? "depois" : "durante";
  const day = state === "durante" ? dated.find((d) => d.date === today) ?? dated[0] : state === "depois" ? dated[dated.length - 1] : dated[0];
  const dest = destinations.find((d) => d.id === day?.destination_id) ?? destinations[0] ?? null;
  const cc = countryCode(dest?.country);
  const currency = cc ? CURRENCY_BY_COUNTRY[cc] : null;

  useEffect(() => {
    const t = setInterval(() => setNow(localNow(tz)), 30000);
    setNow(localNow(tz));
    return () => clearInterval(t);
  }, [tz]);

  // clima e fuso do destino (Open-Meteo, sem chave)
  useEffect(() => {
    if (!dest?.lat || !dest?.lng || !day?.date) return;
    const ahead = daysBetween(new Date().toISOString().slice(0, 10), day.date);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${dest.lat}&longitude=${dest.lng}&timezone=auto&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code${ahead >= 0 && ahead <= 15 ? `&start_date=${day.date}&end_date=${day.date}` : "&forecast_days=1"}`;
    fetch(url).then((r) => r.json()).then((d) => {
      if (d.timezone) setTz(d.timezone);
      if (ahead >= 0 && ahead <= 15 && d.daily?.time?.length) setWx({ tmax: d.daily.temperature_2m_max[0], tmin: d.daily.temperature_2m_min[0], rain: d.daily.precipitation_probability_max[0], code: d.daily.weather_code[0] });
    }).catch(() => {});
  }, [dest?.lat, dest?.lng, day?.date]);

  useEffect(() => {
    if (!currency || currency === "BRL") return;
    fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=BRL`).then((r) => r.json()).then((d) => setFx(d.rates?.BRL ?? null)).catch(() => {});
  }, [currency]);

  const dayItems = useMemo(() => items.filter((i) => i.day_id === day?.id).sort((a, b) => a.position - b.position), [items, day?.id]);
  const computed = useMemo(() => cascade(dayItems, { date: day?.date, dayStart: day?.day_start || "09:00", pace, rainProbability: wx?.rain ?? null }), [dayItems, day?.date, day?.day_start, pace, wx?.rain]);
  const isToday = state === "durante" && day?.date === today;
  const next = computed.items.find((it) => !it.done && (!isToday || (toMin(it.end) ?? 0) > now.minutes)) ?? null;
  const leaveAt = next ? (toMin(next.start) ?? 0) - next.travel_before - 5 : null;
  const leaveIn = isToday && leaveAt != null ? leaveAt - now.minutes : null;

  const toggleDone = async (it: Item) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    const { error } = await supabaseBrowser().from("itinerary_items").update({ done: !it.done }).eq("id", it.id);
    if (error) setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: it.done } : x)));
  };

  if (!day) {
    return <EmptyState title="Ainda não há dias no roteiro" text="Monte o roteiro com o Pino para usar o modo Hoje durante a viagem." action={<Link className="btn-primary" href={`/app/viagem/${tripId}`}>Abrir roteiro</Link>} />;
  }

  const countdown = state === "antes" && first ? daysBetween(today, first) : null;
  const links = next ? navLinks(next) : null;
  const amt = Number(amount.replace(",", ".")) || 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* faixa superior: hora local, clima, câmbio */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3">
          <div className="label flex items-center gap-1"><Clock size={11} /> Hora local</div>
          <div className="mono text-xl font-semibold">{now.hhmm}</div>
          <div className="truncate text-[11px] text-gray">{tz?.split("/").pop()?.replace("_", " ") ?? dest?.city ?? ""}</div>
        </div>
        <div className="card p-3">
          <div className="label flex items-center gap-1"><CloudRain size={11} /> Clima</div>
          {wx ? (
            <>
              <div className="mono text-xl font-semibold">{Math.round(wx.tmax)}°<span className="text-sm text-gray">/{Math.round(wx.tmin)}°</span></div>
              <div className="truncate text-[11px] text-gray">{weatherLabel(wx.code)} · chuva {wx.rain}%</div>
            </>
          ) : <div className="text-xs text-gray">previsão até 16 dias antes</div>}
        </div>
        <div className="card p-3">
          <div className="label flex items-center gap-1"><ArrowRightLeft size={11} /> {currency && currency !== "BRL" ? `${currency} → BRL` : "Moeda"}</div>
          {currency && currency !== "BRL" ? (
            <div className="flex items-baseline gap-1">
              <input className="mono w-14 rounded border border-line px-1 text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Valor em ${currency}`} />
              <span className="mono text-sm font-semibold">= {fx ? (amt * fx).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "…"}</span>
            </div>
          ) : <div className="text-xs text-gray">em real</div>}
        </div>
      </div>

      {state === "antes" && (
        <div className="card flex items-center gap-3 p-4">
          <PinoAvatar mood="oi" size={44} />
          <div>
            <div className="font-display text-lg font-bold">Faltam <span className="mono text-blue">{countdown}</span> dia{countdown === 1 ? "" : "s"} para {tripTitle}</div>
            <p className="text-sm text-gray">Esta é a prévia do primeiro dia. No dia da viagem, o Pino mostra aqui o próximo compromisso e a hora de sair.</p>
          </div>
        </div>
      )}
      {state === "depois" && <div className="card p-4 text-sm text-gray">A viagem terminou. Mostrando o último dia.</div>}

      {/* próximo compromisso */}
      {next ? (
        <section className="hero-gradient overflow-hidden rounded-3xl p-5 text-white shadow-[var(--shadow-pop)]" aria-live="polite">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-white p-0.5"><PinoAvatar mood="partiu" size={44} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">Partiu! · próximo</div>
              <h2 className="truncate font-display text-2xl font-extrabold">{next.title}</h2>
              <div className="mono text-sm text-white/90">{next.start} → {next.end}{next.anchor && " · horário fixo"}</div>
            </div>
          </div>
          {leaveAt != null && (
            <div className="mt-4 rounded-2xl bg-white/15 p-3 backdrop-blur">
              <div className="text-sm text-white/85">{next.travel_before > 0 ? `${modeLabel(next.transport_mode)} · ${fmtDuration(next.travel_before)} de deslocamento` : "Já está no local ou sem deslocamento"}</div>
              <div className="font-display text-xl font-bold">
                Saia às <span className="mono">{fromMin(leaveAt)}</span>
                {leaveIn != null && leaveIn > 0 && <span className="text-base font-semibold text-white/85"> · em {fmtDuration(leaveIn)}</span>}
                {leaveIn != null && leaveIn <= 0 && <span className="text-base font-semibold text-white"> · saia agora</span>}
              </div>
            </div>
          )}
          {links && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <a className="btn bg-white text-blue hover:bg-blue-50" href={links.google} target="_blank" rel="noopener noreferrer"><Navigation size={16} /> Google Maps</a>
              <a className="btn bg-white/15 text-white hover:bg-white/25" href={links.waze} target="_blank" rel="noopener noreferrer">Waze</a>
              <a className="btn bg-white/15 text-white hover:bg-white/25" href={links.apple} target="_blank" rel="noopener noreferrer"><MapPin size={16} /> Apple Maps</a>
              {links.uber && <a className="btn bg-white/15 text-white hover:bg-white/25" href={links.uber} target="_blank" rel="noopener noreferrer"><Car size={16} /> Uber</a>}
            </div>
          )}
          {canEdit && (
            <button className="btn mt-3 w-full border border-white/40 text-white hover:bg-white/10" onClick={() => toggleDone(next)}><Check size={16} /> Marcar como feito</button>
          )}
        </section>
      ) : (
        <EmptyState mood="achei" title={dayItems.length ? "Dia concluído!" : "Dia livre"} text={dayItems.length ? "Tudo feito por hoje. Aproveite!" : "Nada planejado para este dia."} />
      )}

      {/* resto do dia */}
      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-bold"><CalendarDays size={16} /> {fmtDate(day.date, true)}{day.title ? ` · ${day.title}` : ""}</h3>
          <Link href={`/app/viagem/${tripId}`} className="text-sm font-semibold text-blue">Roteiro</Link>
        </div>
        {computed.conflicts.filter((c) => c.severity === "alta").slice(0, 2).map((c, i) => (
          <div key={i} className="mb-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger">{c.message}</div>
        ))}
        <ol className="space-y-1">
          {computed.items.map((it) => {
            const past = isToday && (toMin(it.end) ?? 0) <= now.minutes;
            return (
              <li key={it.id}>
                {it.travel_before > 0 && <div className="mono pl-[60px] text-[11px] text-gray">↓ {modeLabel(it.transport_mode)} · {fmtDuration(it.travel_before)}</div>}
                <div className={clsx("flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5", it.id === next?.id && "bg-blue-50", (it.done || past) && "opacity-60")}>
                  <span className="mono w-12 text-sm font-semibold">{it.start}</span>
                  <div className="min-w-0 flex-1">
                    <div className={clsx("truncate text-sm font-semibold", it.done && "line-through")}>{it.title}</div>
                    <div className="flex flex-wrap gap-1 text-[11px] text-gray">
                      <span>{fmtDuration(it.duration_min)}</span>
                      {it.anchor && <Pill tone="blue"><Anchor size={9} /> fixo</Pill>}
                      {it.outdoor && wx && wx.rain > 70 && <Pill tone="warn">chuva prevista</Pill>}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => toggleDone(it)} className={clsx("flex h-11 w-11 items-center justify-center rounded-full border", it.done ? "border-blue bg-blue text-white" : "border-line text-gray")} aria-label={it.done ? `Desmarcar ${it.title}` : `Marcar ${it.title} como feito`} aria-pressed={it.done}>
                      <Check size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
