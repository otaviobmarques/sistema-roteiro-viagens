"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Star } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtBRL } from "@/lib/domain/settle";
import { TRAVEL_PROFILES, explainScore } from "@/lib/domain/score";
import { fmtDateShort } from "@/lib/domain/time";
import { PinoAvatar, ScoreBadge, Pill, Notice } from "@/components/ui";
import type { Day, Item, ItemOption } from "@/lib/types";

const P = ["mochilao", "classica", "experiencia"] as const;
const TRANSPORT = { mochilao: "A pé, ônibus, trem 2ª classe", classica: "Metrô, trem e aplicativo", experiencia: "Transfer privativo, trem 1ª classe" };

export function ProfilesClient(p: { tripId: string; current: string; canEdit: boolean; people: number; rooms: number; nights: number; mustCount: number; days: Day[]; items: Item[]; options: ItemOption[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [busy, setBusy] = useState<string | null>(null);
  const [dayId, setDayId] = useState(p.days[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const optsByItem = useMemo(() => {
    const m = new Map<string, ItemOption[]>();
    p.options.forEach((o) => m.set(o.item_id, [...(m.get(o.item_id) ?? []), o]));
    return m;
  }, [p.options]);

  const totals = useMemo(() => {
    const t: Record<string, number> = { mochilao: 0, classica: 0, experiencia: 0 };
    for (const prof of P) {
      for (const it of p.items) {
        const o = optsByItem.get(it.id)?.find((x) => x.travel_profile === prof);
        const price = o?.est_price_cents ?? it.cost_cents ?? 0;
        if (it.kind === "hospedagem") t[prof] += price * p.rooms * Math.max(1, Math.round(p.nights / Math.max(1, p.items.filter((x) => x.kind === "hospedagem").length)));
        else t[prof] += price * p.people;
      }
    }
    return t;
  }, [p, optsByItem]);

  const sample = (prof: string, kind: string) => {
    const kinds = kind === "lugar" ? ["lugar", "atividade"] : [kind];
    const it = p.items.find((i) => kinds.includes(i.kind) && optsByItem.get(i.id)?.some((o) => o.travel_profile === prof));
    return it ? optsByItem.get(it.id)!.find((o) => o.travel_profile === prof)!.title : "—";
  };

  const applyProfile = async (prof: string) => {
    setBusy(prof);
    // troca cada item pela opção do perfil (mistura por item continua possível no planejador)
    for (const it of p.items) {
      if (it.must_have || it.anchor) continue;
      const o = optsByItem.get(it.id)?.find((x) => x.travel_profile === prof);
      if (!o) continue;
      await sb.from("itinerary_items").update({ title: o.title, place_id: o.place_id, lat: o.lat, lng: o.lng, score: o.score, cost_cents: o.est_price_cents, travel_profile: prof, why: o.reason }).eq("id", it.id);
      await sb.from("item_options").update({ chosen: false }).eq("item_id", it.id);
      await sb.from("item_options").update({ chosen: true }).eq("id", o.id);
    }
    await sb.from("trip_preferences").update({ travel_profile: prof }).eq("trip_id", p.tripId);
    setBusy(null);
    setMsg(`Pronto! O roteiro agora está no perfil ${TRAVEL_PROFILES[prof as keyof typeof TRAVEL_PROFILES].label}. Trocar de perfil é ajuste incluso.`);
    router.refresh();
  };

  const specialDay = async () => {
    setBusy("dia");
    for (const it of p.items.filter((i) => i.day_id === dayId && !i.anchor && !i.must_have)) {
      const o = optsByItem.get(it.id)?.find((x) => x.travel_profile === "experiencia");
      if (o) await sb.from("itinerary_items").update({ title: o.title, place_id: o.place_id, lat: o.lat, lng: o.lng, score: o.score, cost_cents: o.est_price_cents, travel_profile: "experiencia", why: o.reason }).eq("id", it.id);
    }
    const { data: prefs } = await sb.from("trip_preferences").select("special_days").eq("trip_id", p.tripId).single();
    const list = Array.isArray(prefs?.special_days) ? prefs!.special_days : [];
    await sb.from("trip_preferences").update({ special_days: [...new Set([...list, dayId])] }).eq("trip_id", p.tripId);
    setBusy(null);
    setMsg("Dia especial marcado: os itens desse dia subiram para o perfil Experiência.");
    router.refresh();
  };

  const dayItems = p.items.filter((i) => i.day_id === dayId && optsByItem.has(i.id));
  const base = totals.classica || 1;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray">Mesmas cidades, mesmos dias{p.mustCount ? ` e os ${p.mustCount} itens "não abro mão"` : ""}. Muda o padrão de gasto. Valores estimados para {p.people} pessoa(s).</p>
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="grid gap-3 md:grid-cols-3">
        {P.map((prof) => {
          const chosen = p.current === prof;
          const diff = Math.round(((totals[prof] - base) / base) * 100);
          return (
            <div key={prof} className={clsx("rounded-2xl p-5", chosen ? "hero-gradient text-white shadow-[var(--shadow-pop)] md:-translate-y-2" : "card")}>
              <div className="flex items-center justify-between">
                <span className={clsx("label", chosen && "text-white/80")}>{TRAVEL_PROFILES[prof].label}</span>
                {chosen ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">escolhida</span> : diff !== 0 && <Pill tone={diff < 0 ? "teal" : "warn"}>{diff > 0 ? "+" : ""}{diff}%</Pill>}
              </div>
              <div className="mono mt-2 text-3xl font-semibold">{fmtBRL(totals[prof])}</div>
              <div className={clsx("mono text-xs", chosen ? "text-white/80" : "text-gray")}>{fmtBRL(Math.round(totals[prof] / p.people))} por pessoa</div>
              <dl className="mt-4 space-y-2 text-sm">
                {[["Hospedagem", sample(prof, "hospedagem")], ["Comida", sample(prof, "refeicao")], ["Passeios", sample(prof, "lugar")], ["Transporte", TRANSPORT[prof]]].map(([l, v]) => (
                  <div key={l}><dt className={clsx("text-[10px] font-semibold uppercase tracking-widest", chosen ? "text-white/70" : "text-gray")}>{l}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
              {p.canEdit && (
                <button disabled={!!busy || chosen} onClick={() => applyProfile(prof)} className={clsx("btn mt-4 w-full", chosen ? "bg-white text-blue" : "btn-secondary")}>
                  {busy === prof ? <Loader2 size={14} className="animate-spin" /> : chosen ? `Manter ${TRAVEL_PROFILES[prof].label}` : `Usar ${TRAVEL_PROFILES[prof].label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">Escolha por item</h2>
            <p className="text-xs text-gray">Uma opção de cada perfil, com nota para vocês. Pode misturar: troque no planejador.</p>
          </div>
          <div className="flex gap-2">
            <select className="input w-auto" value={dayId} onChange={(e) => setDayId(e.target.value)} aria-label="Dia">
              {p.days.map((d) => <option key={d.id} value={d.id}>Dia {d.position + 1}{d.date ? ` · ${fmtDateShort(d.date)}` : ""} {d.title ? `· ${d.title}` : ""}</option>)}
            </select>
            {p.canEdit && <button className="btn-secondary btn-sm" onClick={specialDay} disabled={!!busy}><Star size={14} /> Marcar como dia especial</button>}
          </div>
        </div>
        <div className="mt-3 space-y-4">
          {dayItems.length === 0 && <p className="text-sm text-gray">Este dia não tem itens com opções.</p>}
          {dayItems.map((it) => {
            const opts = (optsByItem.get(it.id) ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            const best = opts[0];
            return (
              <div key={it.id}>
                <div className="mb-1.5 text-sm font-semibold">{it.kind === "hospedagem" ? "Hospedagem" : it.kind === "refeicao" ? "Refeição" : "Passeio"} · {it.title}</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {opts.map((o) => (
                    <div key={o.id} className={clsx("rounded-xl border p-3", o.chosen ? "border-teal bg-teal-50/40" : "border-line bg-white")}>
                      <div className="flex items-center justify-between"><Pill tone={o.travel_profile === "experiencia" ? "warn" : o.travel_profile === "mochilao" ? "teal" : "blue"}>{TRAVEL_PROFILES[o.travel_profile as keyof typeof TRAVEL_PROFILES]?.label}</Pill><ScoreBadge score={o.score} /></div>
                      <div className="mt-1.5 text-sm font-semibold">{o.title}</div>
                      <div className="mono text-[11px] text-gray">{o.est_price_cents != null ? fmtBRL(o.est_price_cents) : ""}{o.reason ? ` · ${o.reason}` : ""}</div>
                    </div>
                  ))}
                </div>
                {best && (
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-ice px-3 py-2 text-xs">
                    <PinoAvatar size={20} />
                    <span><b>Por que {best.score?.toFixed(1)}:</b> {explainScore({ quality: best.score_quality ?? 6, fit: (best.score ?? 6) * 2 - (best.score_quality ?? 6), profileLabel: TRAVEL_PROFILES[best.travel_profile as keyof typeof TRAVEL_PROFILES]?.label ?? "", inBudget: true })}. Nota de qualidade da base própria (OpenStreetMap/Wikidata).</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
