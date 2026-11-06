import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { askPino, loadTripContext } from "@/lib/ai/assistant";
import { AIUnavailableError } from "@/lib/ai/claude";
import { TripPlaces } from "@/lib/domain/dedupe";

export const maxDuration = 60;

/** Chat com o Pino (RF-140/141): responde e devolve ações para a pessoa aplicar ou descartar. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { message, history, dayId } = await req.json();
  if (!message || typeof message !== "string" || message.length > 1000) return NextResponse.json({ error: "mensagem inválida" }, { status: 400 });
  const { data: member } = await supabase.from("trip_members").select("role").eq("trip_id", id).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "sem acesso" }, { status: 403 });
  const started = Date.now();
  try {
    const ctx = await loadTripContext(supabase, id, dayId ?? null);
    const r = await askPino({ message, history: Array.isArray(history) ? history : [], context: ctx, dayId: dayId ?? null });
    const validDays = new Set(ctx.days.map((d) => d.id));
    const validItems = new Map(ctx.items.map((i) => [i.id, i]));
    const tripPlaces = TripPlaces.from(ctx.items.filter((i) => i.day_id), ctx.dest ? [ctx.dest.city] : []);
    // Salvaguardas: só ações coerentes com o roteiro e com lugares verificados
    const actions = r.data.actions
      .filter((a) => {
        if (a.type === "add") {
          const cand = a.candidate ? r.codes.get(a.candidate) : null;
          if (!a.day_id || !validDays.has(a.day_id) || (a.candidate && !cand) || (!cand && a.kind !== "nota" && a.kind !== "livre")) return false;
          return tripPlaces.tryAdd({ place_id: cand?.id ?? null, title: cand?.name ?? a.title ?? "", kind: a.kind }); // sem duplicar lugar da viagem
        }
        if (!a.item_id || !validItems.has(a.item_id)) return false;
        const it = validItems.get(a.item_id)!;
        if ((a.type === "remove" || a.type === "move") && (it.must_have || it.anchor)) return false; // RN-02 / RN-20
        if (a.type === "move") return !!a.day_id && validDays.has(a.day_id);
        if (a.type === "update" && a.candidate) {
          const cand = r.codes.get(a.candidate);
          if (!cand) return false;
          const others = TripPlaces.from(ctx.items.filter((i) => i.day_id && i.id !== it.id), ctx.dest ? [ctx.dest.city] : []);
          return !others.has({ place_id: cand.id, title: cand.name, kind: it.kind });
        }
        return true;
      })
      .map((a) => {
        const cand = a.candidate ? r.codes.get(a.candidate) : null;
        return { ...a, place: cand ? { id: cand.id, name: cand.name, lat: cand.lat, lng: cand.lng, category: cand.category, interest: cand.interest, opening_hours: cand.opening_hours, outdoor: cand.outdoor } : null };
      });
    await supabase.from("ai_generations").insert({ user_id: user.id, trip_id: id, kind: "chat", status: "concluida", input: { message }, output: { reply: r.data.reply, actions: actions.length }, input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, cost_ai_cents: r.usage.costCents, cost_total_cents: r.usage.costCents, duration_ms: Date.now() - started });
    return NextResponse.json({ reply: r.data.reply, actions, canEdit: member.role !== "visualizador" });
  } catch (e) {
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: "O Pino ainda não foi ligado: falta configurar a chave da IA." }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
