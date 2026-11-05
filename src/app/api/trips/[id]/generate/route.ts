import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { generateTrip } from "@/lib/ai/itinerary";
import { AIUnavailableError, AIRefusalError } from "@/lib/ai/claude";

export const maxDuration = 300;

/**
 * Roteiro completo (RF-231, RN-16/17): verifica crédito antes, gera, e só debita ao terminar com sucesso.
 * Se a viagem já foi gerada, é ajuste incluso (RN-18) e não cobra de novo.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: trip } = await supabase.from("trips").select("id, owner_id, generated").eq("id", id).maybeSingle();
  if (!trip) return NextResponse.json({ error: "Viagem não encontrada" }, { status: 404 });
  if (trip.owner_id !== user.id) return NextResponse.json({ error: "Só o organizador pode gerar o roteiro completo." }, { status: 403 });
  const { data: ok } = await supabase.rpc("has_credit_for", { p_trip: id });
  if (!ok) return NextResponse.json({ error: "Você precisa de 1 crédito para gerar o roteiro completo.", needCredit: true }, { status: 402 });

  const { data: gen } = await supabase.from("ai_generations").insert({ user_id: user.id, trip_id: id, kind: trip.generated ? "ajuste" : "completa", status: "iniciada" }).select("id").single();
  try {
    const r = await generateTrip(supabase, id, user.id);
    await supabase.from("ai_generations").update({
      status: "concluida", score: r.viability, output: { mustHaves: r.mustHaves, tips: r.tips, profileTotals: r.profileTotals, conflicts: r.conflicts },
      input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, cost_ai_cents: r.usage.costCents, cost_total_cents: r.usage.costCents, duration_ms: r.durationMs,
    }).eq("id", gen!.id);
    const { data: balance, error: creditErr } = await supabase.rpc("consume_credit", { p_trip: id, p_generation: gen!.id });
    if (creditErr) {
      // sem crédito no fim (ex.: duas gerações ao mesmo tempo): desfaz o roteiro gravado
      await supabase.from("days").delete().eq("trip_id", id);
      throw new Error(creditErr.message);
    }
    return NextResponse.json({ ok: true, viability: r.viability, balance, mustHaves: r.mustHaves, tips: r.tips, profileTotals: r.profileTotals });
  } catch (e) {
    await supabase.from("ai_generations").update({ status: "falhou", error: (e as Error).message }).eq("id", gen!.id);
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof AIRefusalError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: `Não consegui gerar agora (nada foi cobrado): ${(e as Error).message}` }, { status: 500 });
  }
}
