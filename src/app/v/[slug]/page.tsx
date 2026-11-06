// Página pública da viagem (tela 27, RF-120). Somente leitura; sem gastos, reservas e pessoas (RN-09).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo, PinoAvatar, ScoreBadge, Pill } from "@/components/ui";
import { fmtDate, fmtDuration } from "@/lib/domain/time";
import { fmtBRL } from "@/lib/domain/settle";
import { PublicMap } from "@/components/public/public-map";
import { CopyTripButton } from "@/components/public/copy-trip-button";

type PublicItem = { title: string; kind: string; start_time: string | null; duration_min: number; lat: number | null; lng: number | null; category: string | null; why: string | null; score: number | null; cost_cents: number | null };
type PublicTrip = {
  id: string; title: string; start_date: string | null; end_date: string | null; emoji: string | null; cover_color: string | null; viability_score: number | null; hide_costs: boolean;
  destinations: { city: string; country: string | null; lat: number | null; lng: number | null; days: number | null }[];
  days: { id: string; date: string | null; title: string | null; position: number; items: PublicItem[] }[];
};

const getTrip = cache(async (slug: string) => {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("get_public_trip", { p_slug: slug });
  return (data as PublicTrip | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTrip(slug);
  if (!t) return { title: "Roteiro não encontrado" };
  const cities = t.destinations.map((d) => d.city).join(", ");
  const desc = `${t.days.length} dias · ${cities}. Roteiro montado no Rotta 365 com lugares verificados. Copie e adapte para as suas datas.`;
  return {
    title: t.title,
    description: desc,
    openGraph: { title: `${t.title} · Rotta 365`, description: desc, type: "article", locale: "pt_BR", siteName: "Rotta 365" },
    twitter: { card: "summary_large_image", title: `${t.title} · Rotta 365`, description: desc },
  };
}

export default async function PublicTripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTrip(slug);
  if (!t) notFound();
  const points = t.days.flatMap((d, di) => d.items.filter((i) => i.lat != null && i.lng != null).map((i, k) => ({ id: `${di}-${k}`, lat: i.lat!, lng: i.lng!, title: i.title, label: String(di + 1), tone: (di % 2 ? "teal" : "blue") as "teal" | "blue" })));
  const total = t.hide_costs ? null : t.days.reduce((s, d) => s + d.items.reduce((a, i) => a + (i.cost_cents ?? 0), 0), 0);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <Link href="/entrar" className="btn-secondary btn-sm">Entrar</Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="hero-gradient mb-6 rounded-3xl p-6 text-white shadow-[var(--shadow-pop)] md:p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">Roteiro público</div>
          <h1 className="mt-1 font-display text-3xl font-extrabold md:text-4xl">{t.emoji ? `${t.emoji} ` : ""}{t.title}</h1>
          <p className="mono mt-1 text-sm text-white/90">
            {t.days.length} dias · {t.destinations.map((d) => d.city).join(" › ")}
            {t.start_date ? ` · ${fmtDate(t.start_date)}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <CopyTripButton tripId={t.id} slug={slug} />
            {t.viability_score != null && <span className="mono rounded-full bg-white/15 px-3 py-1 text-sm">viabilidade {t.viability_score}</span>}
            {total != null && total > 0 && <span className="mono rounded-full bg-white/15 px-3 py-1 text-sm">≈ {fmtBRL(total)} por pessoa</span>}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            {t.days.map((d, di) => (
              <section key={d.id} className="card p-4">
                <h2 className="mb-3 font-display text-lg font-bold">
                  <span className="mono mr-2 text-blue">Dia {di + 1}</span>{d.title}
                  {d.date && <span className="ml-2 text-sm font-medium text-gray">{fmtDate(d.date, true)}</span>}
                </h2>
                {d.items.length === 0 ? <p className="text-sm text-gray">Dia livre.</p> : (
                  <ol className="space-y-2">
                    {d.items.map((i, k) => (
                      <li key={k} className="flex gap-3 rounded-xl border border-line p-3">
                        <span className="mono w-12 shrink-0 text-sm font-semibold">{i.start_time ?? "—"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{i.title}</span>
                            {i.category && <Pill>{i.category}</Pill>}
                          </div>
                          <div className="text-xs text-gray">{fmtDuration(i.duration_min)}{!t.hide_costs && i.cost_cents ? ` · ${fmtBRL(i.cost_cents)}` : ""}</div>
                          {i.why && <p className="mt-1 text-xs text-gray"><b className="text-navy">Por que o Pino escolheu:</b> {i.why}</p>}
                        </div>
                        <ScoreBadge score={i.score} />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <PublicMap points={points} />
            <div className="card flex items-start gap-3 p-4">
              <PinoAvatar mood="oi" size={40} />
              <div className="text-sm">
                <div className="font-bold">Quer viver esse roteiro?</div>
                <p className="text-gray">Copie para a sua conta, escolha as suas datas e o Pino ajusta horários e clima.</p>
              </div>
            </div>
            <p className="text-[11px] text-gray">Mapa © colaboradores do OpenStreetMap. Gastos, reservas e dados das pessoas não são publicados.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
