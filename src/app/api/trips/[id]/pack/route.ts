// RF-090: mala sugerida pelo Pino (clima, duração, atividades e perfil). Não envia dados pessoais ao modelo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { askJSON, AIUnavailableError, AIRefusalError, PINO_VOICE } from "@/lib/ai/claude";
import { weather, weatherLabel } from "@/lib/context";
import { addDays } from "@/lib/domain/time";

export const maxDuration = 60;

const PackSchema = z.object({
  intro: z.string().describe("uma frase curta do Pino explicando a lógica da mala"),
  items: z.array(z.object({
    list: z.enum(["mala", "pre_viagem"]),
    category: z.string().describe("ex.: Roupas, Higiene, Eletrônicos, Documentos, Saúde, Crianças, Tarefas"),
    label: z.string(),
    shared: z.boolean().describe("true se um item só serve o grupo todo (ex.: adaptador de tomada, protetor solar)"),
  })),
});

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { data: trip } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!trip) return NextResponse.json({ error: "Viagem não encontrada." }, { status: 404 });

  const [{ data: dests }, { data: prefs }, { data: items }, { data: existing }] = await Promise.all([
    supabase.from("trip_destinations").select("city, country, lat, lng, days").eq("trip_id", id).order("position"),
    supabase.from("trip_preferences").select("travel_profile, occasion").eq("trip_id", id).maybeSingle(),
    supabase.from("itinerary_items").select("title, kind, category, outdoor").eq("trip_id", id).limit(120),
    supabase.from("checklist_items").select("label").eq("trip_id", id),
  ]);

  // clima previsto (só existe até ~16 dias à frente)
  let cursor = trip.start_date as string | null;
  const climate: string[] = [];
  for (const d of dests ?? []) {
    let line = `${d.city}${d.country ? ` (${d.country})` : ""}: ${d.days ?? "?"} dia(s)`;
    if (cursor && d.lat != null && d.lng != null) {
      const end = addDays(cursor, Math.max(0, (d.days ?? 1) - 1));
      const w = await weather(d.lat, d.lng, cursor, end);
      const vals = Object.values(w);
      if (vals.length) {
        const tmax = Math.max(...vals.map((v) => v.tmax ?? -99));
        const tmin = Math.min(...vals.map((v) => v.tmin ?? 99));
        const rain = Math.max(...vals.map((v) => v.rain ?? 0));
        line += ` · previsão ${Math.round(tmin)}–${Math.round(tmax)}°C, chuva até ${rain}%, ${weatherLabel(vals[0].code)}`;
      } else line += ` · sem previsão ainda (datas: a partir de ${cursor}); use o clima típico da época`;
      cursor = addDays(cursor, d.days ?? 1);
    }
    climate.push(line);
  }
  const activities = [...new Set((items ?? []).map((i) => i.category || i.kind).filter(Boolean))].slice(0, 30);
  const outdoor = (items ?? []).filter((i) => i.outdoor).length;

  const prompt = `Monte a mala e a lista pré-viagem.
Destinos e clima:
${climate.join("\n") || "não definidos"}
Datas: ${trip.start_date ?? "?"} a ${trip.end_date ?? "?"}
Viajantes: ${trip.travelers_adults} adulto(s), ${trip.travelers_children} criança(s)${trip.children_ages?.length ? ` (${trip.children_ages.join(", ")} anos)` : ""}
Perfil: ${prefs?.travel_profile ?? "classica"} · Ocasião: ${prefs?.occasion ?? "nenhuma"}
Tipos de atividade no roteiro: ${activities.join(", ") || "ainda sem roteiro"} · ${outdoor} atividade(s) ao ar livre
Origem: ${trip.origin_city ?? "Brasil"}
Já existem na lista (não repita): ${(existing ?? []).map((e) => e.label).join("; ") || "nada"}
Entre 18 e 35 itens no total, práticos e específicos para esse clima e essas atividades. Inclua tarefas pré-viagem relevantes (documentos, seguro, câmbio, chip, ingressos) só se fizer sentido para o destino.`;

  const { data: gen } = await supabase.from("ai_generations").insert({ user_id: auth.user.id, trip_id: id, kind: "mala", input: { destinations: (dests ?? []).length } }).select("id").single();
  try {
    const { data, usage } = await askJSON({ schema: PackSchema, system: `${PINO_VOICE}\nVocê sugere listas de mala objetivas, sem itens óbvios demais nem duplicados.`, prompt, effort: "low", maxTokens: 6000 });
    if (gen) await supabase.from("ai_generations").update({ status: "concluida", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_ai_cents: usage.costCents, cost_total_cents: usage.costCents, duration_ms: usage.ms }).eq("id", gen.id);
    return NextResponse.json(data);
  } catch (e) {
    if (gen) await supabase.from("ai_generations").update({ status: "falhou", error: String((e as Error).message).slice(0, 500) }).eq("id", gen.id);
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: "A sugestão do Pino ainda não está configurada. Use a lista padrão ou adicione itens à mão." }, { status: 503 });
    if (e instanceof AIRefusalError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Não consegui sugerir agora. Tente de novo em instantes." }, { status: 500 });
  }
}
