// Backoffice: todos os roteiros dos clientes (gerados, em geração, só na prévia e com falha), com PDF.
import Link from "next/link";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Pill } from "@/components/ui";
import { tripPeriod } from "@/lib/labels";
import { DownloadPdfButton } from "@/components/export/print-button";

export const metadata = { title: "Roteiros" };
export const dynamic = "force-dynamic";

type Phase = "gerado" | "gerando" | "previa" | "falhou" | "manual";
const PHASE: Record<Phase, { label: string; tone: "ok" | "warn" | "blue" | "danger" | "neutral" }> = {
  gerado: { label: "Gerado", tone: "ok" },
  gerando: { label: "Gerando agora", tone: "warn" },
  previa: { label: "Só prévia", tone: "blue" },
  falhou: { label: "Falhou", tone: "danger" },
  manual: { label: "Montado à mão", tone: "neutral" },
};
const FILTERS: { id: "todos" | Phase; label: string }[] = [
  { id: "todos", label: "Todos" }, { id: "gerado", label: "Gerados" }, { id: "gerando", label: "Gerando agora" },
  { id: "previa", label: "Só prévia" }, { id: "falhou", label: "Falharam" },
];
const dt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function AdminTrips({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f = "todos", q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const { data: trips } = await supabase
    .from("trips")
    .select("id, title, status, generated, start_date, end_date, created_at, viability_score, owner_id, travelers_adults, travelers_children")
    .order("created_at", { ascending: false })
    .limit(300);
  const ids = (trips ?? []).map((t) => t.id);
  const owners = [...new Set((trips ?? []).map((t) => t.owner_id))];
  const [{ data: profiles }, { data: gens }, { data: dests }, { data: items }] = await Promise.all([
    owners.length ? supabase.from("profiles").select("id, name").in("id", owners) : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    ids.length ? supabase.from("ai_generations").select("trip_id, kind, status, created_at, error").in("trip_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as { trip_id: string; kind: string; status: string; created_at: string; error: string | null }[] }),
    ids.length ? supabase.from("trip_destinations").select("trip_id, city, position").in("trip_id", ids).order("position") : Promise.resolve({ data: [] as { trip_id: string; city: string; position: number }[] }),
    ids.length ? supabase.from("itinerary_items").select("trip_id").in("trip_id", ids).not("day_id", "is", null).limit(20000) : Promise.resolve({ data: [] as { trip_id: string }[] }),
  ]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.name || "—"]));
  const count = new Map<string, number>();
  (items ?? []).forEach((i) => count.set(i.trip_id, (count.get(i.trip_id) ?? 0) + 1));
  const now = Date.now();

  const rows = (trips ?? []).map((t) => {
    const g = (gens ?? []).filter((x) => x.trip_id === t.id);
    const full = g.find((x) => x.kind === "completa");
    let phase: Phase;
    if (t.generated) phase = "gerado";
    else if (full?.status === "iniciada" && now - new Date(full.created_at).getTime() < 10 * 60_000) phase = "gerando";
    else if (full && full.status !== "concluida") phase = "falhou";
    else if (g.some((x) => x.kind === "previa" || x.kind === "descoberta")) phase = "previa";
    else phase = "manual";
    return {
      ...t, phase, client: nameOf.get(t.owner_id) ?? "—", items: count.get(t.id) ?? 0,
      cities: (dests ?? []).filter((d) => d.trip_id === t.id).map((d) => d.city),
      error: phase === "falhou" ? full?.error || (full?.status === "iniciada" ? "parou no meio (mais de 10 min)" : null) : null,
      lastAt: g[0]?.created_at ?? t.created_at,
    };
  });
  const totals = Object.fromEntries((["gerado", "gerando", "previa", "falhou"] as Phase[]).map((p) => [p, rows.filter((r) => r.phase === p).length]));
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (f === "todos" || r.phase === f) && (!term || `${r.title} ${r.client} ${r.cities.join(" ")}`.toLowerCase().includes(term)));
  const href = (nf: string) => `/admin/roteiros?f=${nf}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Backoffice" title="Roteiros dos clientes" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["gerado", "Gerados"], ["gerando", "Gerando agora"], ["previa", "Só na prévia"], ["falhou", "Falharam"]] as [Phase, string][]).map(([p, l]) => (
          <Link key={p} href={href(p)} className={clsx("card px-4 py-3", f === p && "ring-2 ring-blue")}>
            <div className="label">{l}</div>
            <div className="mono text-2xl font-semibold">{totals[p]}</div>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <Link key={x.id} href={href(x.id)} className={clsx("rounded-full border px-3 py-1.5 text-sm font-semibold", f === x.id ? "border-blue bg-blue-50 text-blue" : "border-line bg-white text-gray")}>{x.label}</Link>
        ))}
        <form className="ml-auto flex gap-2" action="/admin/roteiros">
          <input type="hidden" name="f" value={f} />
          <input name="q" defaultValue={q} className="input h-9 w-56" placeholder="Buscar cliente ou destino" />
          <button className="btn-secondary btn-sm">Buscar</button>
        </form>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left"><tr>{["Criado em", "Cliente", "Roteiro", "Período", "Situação", "Itens", "Viabilidade", ""].map((h) => <th key={h} className="label p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="mono p-3 text-xs">{dt(r.created_at)}</td>
                <td className="p-3 font-semibold">{r.client}</td>
                <td className="p-3">
                  <div className="font-semibold">{r.title}</div>
                  {r.cities.length > 0 && <div className="text-xs text-gray">{r.cities.join(" → ")}</div>}
                </td>
                <td className="mono p-3 text-xs">{tripPeriod(r)}<div className="text-gray">{r.travelers_adults + r.travelers_children} pessoa(s)</div></td>
                <td className="p-3">
                  <Pill tone={PHASE[r.phase].tone}>{PHASE[r.phase].label}</Pill>
                  {r.phase === "gerando" && <div className="mt-1 text-xs text-gray">desde {dt(r.lastAt)}</div>}
                  {r.error && <div className="mt-1 max-w-[220px] text-xs text-danger" title={r.error}>{r.error.slice(0, 90)}</div>}
                </td>
                <td className="mono p-3">{r.items || "—"}</td>
                <td className="mono p-3">{r.viability_score != null ? `${r.viability_score}/100` : "—"}</td>
                <td className="p-3">
                  {r.items > 0 ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <a href={`/app/viagem/${r.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink size={14} /> Ver</a>
                      <DownloadPdfButton tripId={r.id} title={r.title} />
                    </div>
                  ) : <span className="text-xs text-gray">sem dias montados</span>}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={8} className="p-6 text-center text-gray">Nenhum roteiro {f !== "todos" ? "nesse filtro" : "ainda"}.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-gray">Somente leitura: o administrador vê e baixa os roteiros, mas não altera nada na viagem do cliente. Atualize a página para ver o andamento das gerações.</p>
    </div>
  );
}
