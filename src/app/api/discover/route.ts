import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { askJSON, AIUnavailableError, AIRefusalError, PINO_VOICE, AI_MODEL } from "@/lib/ai/claude";

export const maxDuration = 60;

// Descoberta por IA (M22): "me surpreenda" e "me ajuda a decidir". Faz parte da prévia grátis (RF-230):
// usa só a IA, sem APIs pagas de lugares.

const CardsSchema = z.object({
  intro: z.string().describe("1 frase curta do Pino apresentando as sugestões"),
  cards: z.array(z.object({
    title: z.string().describe("nome curto da proposta, ex.: Serra Gaúcha romântica"),
    cities: z.array(z.string()).describe("cidades na ordem sugerida"),
    country: z.string(),
    days: z.number().int(),
    price_per_person_brl: z.number().describe("estimativa total por pessoa em reais, incluindo hospedagem e passeios, sem passagens internacionais"),
    reason: z.string().describe("por que combina com a pessoa, até 25 palavras"),
    best_season: z.string().describe("melhor época, ex.: abril a junho"),
    touch: z.string().describe("toque da ocasião, ex.: jantar especial e quarto com vista"),
  })).describe("3 ou 4 cartões, destinos diferentes entre si"),
});

const DecideSchema = z.object({
  answer: z.string().describe("resposta curta e direta, até 70 palavras"),
  options: z.array(z.object({ label: z.string(), pros: z.array(z.string()), cons: z.array(z.string()) })).describe("2 a 4 opções ou períodos comparados"),
  suggestion: z.object({ cities: z.array(z.string()), days: z.number().int(), when: z.string() }).nullable().describe("roteiro que o Pino sugere montar, ou null"),
  caveat: z.string().describe("aviso para conferir datas/clima em fonte oficial, curto"),
});

const OCCASIONS: Record<string, string> = {
  aniversario_casamento: "aniversário de casamento", lua_de_mel: "lua de mel", ferias_filhos: "férias com filhos",
  sozinho: "viagem sozinho", despedida: "despedida", outra: "outra",
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Faça login para usar a prévia grátis." }, { status: 401 });

  // quem tem crédito na carteira não fica preso no limite diário de prévias grátis
  const [{ data: left }, { data: wallet }] = await Promise.all([
    supabase.rpc("previews_left"),
    supabase.from("credit_wallets").select("balance").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if ((left ?? 0) <= 0 && (wallet?.balance ?? 0) <= 0) return NextResponse.json({ error: "Você usou as 3 prévias grátis de hoje. Volte amanhã ou compre um crédito na Carteira para seguir agora." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "decidir" ? "decidir" : "surpreenda";
  const today = new Date().toISOString().slice(0, 10);
  const question = String(body.question || "").slice(0, 600);
  if (mode === "decidir" && question.trim().length < 5) return NextResponse.json({ error: "Escreva sua dúvida." }, { status: 400 });

  const { data: gen } = await supabase.from("ai_generations").insert({ user_id: auth.user.id, kind: "descoberta", input: body }).select("id").single();

  try {
    let result: unknown;
    let usage;
    if (mode === "surpreenda") {
      const a = body.answers ?? {};
      const prompt = `Hoje é ${today}. Sugira destinos para:
- Ocasião: ${OCCASIONS[a.occasion] ?? a.occasion ?? "não informada"}
- Orçamento por pessoa: ${a.budget ? `até R$ ${a.budget}` : "não informado"}
- Dias: ${a.days ?? "não informado"}
- Preferência: ${a.landscape === "praia" ? "praia" : a.landscape === "montanha" ? "montanha" : "tanto faz"}
- Alcance: ${a.scope === "nacional" ? "só Brasil" : a.scope === "internacional" ? "internacional" : "tanto faz"}
- Perfil de gasto: ${a.profile ?? "classica"}
- Saindo de: ${a.origin ?? "Brasil"}
${body.exclude?.length ? `Não repita: ${body.exclude.join(", ")}.` : ""}
${body.adjust ? `Ajuste pedido: ${body.adjust}.` : ""}`;
      const r = await askJSON({ schema: CardsSchema, system: `${PINO_VOICE}\nVocê sugere destinos realistas para viajantes brasileiros. Preços estimados e conservadores, em reais. A ocasião muda o roteiro (aniversário: jantar especial; com crianças: ritmo leve).`, prompt, effort: "low", maxTokens: 4000 });
      result = { mode, ...r.data };
      usage = r.usage;
    } else {
      const r = await askJSON({ schema: DecideSchema, system: `${PINO_VOICE}\nVocê ajuda a decidir viagens usando conhecimento de clima histórico, alta e baixa temporada e férias escolares brasileiras. Seja honesto quando não tiver certeza.`, prompt: `Hoje é ${today}. Pergunta: ${question}`, effort: "low", maxTokens: 3000 });
      result = { mode, ...r.data };
      usage = r.usage;
    }
    if (gen?.id) {
      await supabase.from("ai_generations").update({
        status: "concluida", output: result, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
        cost_ai_cents: usage.costCents, cost_total_cents: usage.costCents, duration_ms: usage.ms,
      }).eq("id", gen.id);
    }
    return NextResponse.json({ ...(result as object), previewsLeft: Math.max(0, (left ?? 1) - 1), model: AI_MODEL });
  } catch (e) {
    const msg = e instanceof AIUnavailableError ? "O Pino ainda não está ligado: a chave da IA não foi configurada." : e instanceof AIRefusalError ? e.message : "O Pino tropeçou ao pensar. Tente de novo.";
    if (gen?.id) await supabase.from("ai_generations").update({ status: "falhou", error: e instanceof Error ? e.message : String(e) }).eq("id", gen.id);
    return NextResponse.json({ error: msg }, { status: e instanceof AIUnavailableError ? 503 : 500 });
  }
}
