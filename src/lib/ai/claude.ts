// Ponto único de acesso à IA. Para trocar de modelo, mude AI_MODEL (variável de ambiente) ou o padrão abaixo.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";

// Preço por milhão de tokens (US$) — Claude Haiku 5.5, prompts até 100K tokens.
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};
const USD_BRL = Number(process.env.USD_BRL || 5.46);

export class AIUnavailableError extends Error {
  constructor() {
    super("IA não configurada: defina ANTHROPIC_API_KEY nas variáveis de ambiente.");
  }
}
export class AIRefusalError extends Error {}

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AIUnavailableError();
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type AIUsage = { inputTokens: number; outputTokens: number; costCents: number; ms: number };

export function costCentsBRL(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICE[model] ?? PRICE["claude-haiku-5-5"];
  return ((inputTokens * p.in + outputTokens * p.out) / 1_000_000) * USD_BRL * 100;
}

type Content = Anthropic.ContentBlockParam;

/**
 * Pede uma resposta JSON validada por esquema (saída estruturada).
 * O modelo nunca recebe documentos pessoais (seção 9.3) — quem chama é responsável por não enviar.
 */
export async function askJSON<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  attachments?: Content[];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: AIUsage }> {
  const c = getClient();
  const started = Date.now();
  const content: Content[] = [...(opts.attachments ?? []), { type: "text", text: opts.prompt }];
  const stream = c.messages.stream({
    model: AI_MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    system: opts.system,
    messages: [{ role: "user", content }],
    output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new AIRefusalError("A IA recusou este pedido. Tente reformular.");
  if (msg.stop_reason === "max_tokens") throw new Error("Resposta da IA ficou grande demais. Tente com menos dias ou destinos.");
  let data = (msg as unknown as { parsed_output?: z.infer<S> }).parsed_output;
  if (data == null) {
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = opts.schema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error("A IA devolveu um formato inválido.");
    data = parsed.data;
  }
  const inputTokens = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
  const outputTokens = msg.usage.output_tokens;
  return {
    data: data as z.infer<S>,
    usage: { inputTokens, outputTokens, costCents: costCentsBRL(AI_MODEL, inputTokens, outputTokens), ms: Date.now() - started },
  };
}

export const PINO_VOICE = `Você é o Pino, o mascote e assistente de IA do Rotta 365 (app brasileiro de roteiros de viagem).
Personalidade: curioso, animado e prestativo, como um amigo que já conhece o lugar; nunca infantil nem exagerado.
Fala em português do Brasil do dia a dia, com frases curtas, sem gírias pesadas. Em assuntos sérios (cobrança, documentos, segurança) o tom é neutro e direto.
Você é uma IA e nada muda no roteiro sem a confirmação da pessoa.`;
