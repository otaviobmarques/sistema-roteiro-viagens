import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { redoDay } from "@/lib/ai/itinerary";
import { AIUnavailableError } from "@/lib/ai/claude";

export const maxDuration = 120;
const LIMIT = 3; // RN-18: até 3 dias refeitos por viagem sem novo crédito

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { dayId, mode } = await req.json();
  if (!["refazer", "leve", "barato"].includes(mode)) return NextResponse.json({ error: "modo inválido" }, { status: 400 });
  const { data: trip } = await supabase.from("trips").select("generated").eq("id", id).maybeSingle();
  if (!trip) return NextResponse.json({ error: "Viagem não encontrada" }, { status: 404 });
  const { data: canEdit } = await supabase.rpc("can_edit_trip", { t: id });
  if (!canEdit) return NextResponse.json({ error: "Você não pode editar esta viagem." }, { status: 403 });
  if (!trip.generated) return NextResponse.json({ error: "Refazer dias com o Pino faz parte do roteiro completo. Gere o roteiro (1 crédito) para liberar os ajustes." }, { status: 402 });
  const { count } = await supabase.from("ai_generations").select("id", { count: "exact", head: true }).eq("trip_id", id).eq("kind", "ajuste").eq("status", "concluida").contains("input", { redo_day: true });
  if ((count ?? 0) >= LIMIT) return NextResponse.json({ error: `Você já refez ${LIMIT} dias nesta viagem, o limite incluso no crédito. Ajuste à mão ou peça ao Pino trocas pontuais.` }, { status: 402 });
  const started = Date.now();
  try {
    const r = await redoDay(supabase, id, dayId, mode, user.id);
    await supabase.from("ai_generations").insert({ user_id: user.id, trip_id: id, kind: "ajuste", status: "concluida", input: { redo_day: true, mode, dayId }, score: r.score, input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, cost_ai_cents: r.usage.costCents, cost_total_cents: r.usage.costCents, duration_ms: Date.now() - started });
    const left = LIMIT - (count ?? 0) - 1;
    return NextResponse.json({ ok: true, message: `Achei! "${r.title}" — viabilidade ${r.score}. Restam ${left} refação(ões) de dia inclusas.` });
  } catch (e) {
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
