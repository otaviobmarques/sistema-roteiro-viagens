// RF-061: extração por IA de confirmações (texto colado, PDF ou imagem). Nada é gravado aqui além do registro de custo (RF-062).
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { askJSON, AIUnavailableError, AIRefusalError, AI_MODEL } from "@/lib/ai/claude";

export const maxDuration = 60;

const KINDS = ["voo", "hotel", "aluguel", "trem", "onibus", "carro", "barco", "ingresso", "restaurante", "passeio", "seguro", "outro"] as const;

const ExtractSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().describe("título curto, ex.: Voo GRU → LIS, Hotel Lisboa Baixa"),
  code: z.string().nullable().describe("localizador / código da reserva"),
  provider: z.string().nullable().describe("companhia, hotel ou fornecedor"),
  start_at: z.string().nullable().describe("início no horário local, formato YYYY-MM-DDTHH:MM"),
  end_at: z.string().nullable().describe("fim no horário local, formato YYYY-MM-DDTHH:MM"),
  location: z.string().nullable().describe("endereço, aeroporto ou estação de partida"),
  value: z.number().nullable().describe("valor total pago, na moeda da reserva"),
  currency: z.string().nullable().describe("código ISO da moeda, ex.: BRL, EUR"),
  free_cancel_until: z.string().nullable().describe("data/hora limite de cancelamento grátis, YYYY-MM-DDTHH:MM"),
  segments: z.array(z.object({ origin: z.string(), destination: z.string(), departs_at: z.string().nullable(), arrives_at: z.string().nullable(), number: z.string().nullable() })).describe("trechos de voo/trem; [] se não houver"),
});

const SYSTEM = `Você extrai dados estruturados de confirmações de reserva de viagem (voo, hotel, trem, ingresso etc.).
Use apenas o que está no documento; quando um campo não aparecer, devolva null. Não invente códigos nem valores.
Datas e horas no horário local do evento. Ignore nomes de passageiros, documentos e dados de pagamento: não os inclua em nenhum campo.`;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { data: canEdit } = await supabase.rpc("can_edit_trip", { t: id });
  if (!canEdit) return NextResponse.json({ error: "Sem permissão para editar esta viagem." }, { status: 403 });

  let text = "";
  const attachments: Parameters<typeof askJSON>[0]["attachments"] = [];
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      text = String(form.get("text") || "");
      const file = form.get("file");
      if (file && typeof file !== "string") {
        if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo maior que 8 MB." }, { status: 400 });
        const data = Buffer.from(await file.arrayBuffer()).toString("base64");
        const type = file.type || "";
        if (type === "application/pdf") {
          attachments.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
        } else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) {
          attachments.push({ type: "image", source: { type: "base64", media_type: type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } });
        } else if (type.startsWith("text/") || type === "message/rfc822") {
          text += "\n" + Buffer.from(data, "base64").toString("utf8");
        } else {
          return NextResponse.json({ error: "Formato não suportado. Envie PDF, imagem (JPG, PNG, WEBP) ou texto." }, { status: 400 });
        }
      }
    } else {
      const body = await req.json();
      text = String(body.text || "");
    }
  } catch {
    return NextResponse.json({ error: "Não consegui ler o envio." }, { status: 400 });
  }
  if (!text.trim() && !attachments.length) return NextResponse.json({ error: "Cole o texto da confirmação ou envie um arquivo." }, { status: 400 });

  const { data: gen } = await supabase.from("ai_generations").insert({ user_id: auth.user.id, trip_id: id, kind: "extracao", input: { has_file: attachments.length > 0, chars: text.length } }).select("id").single();
  try {
    const { data, usage } = await askJSON({
      schema: ExtractSchema,
      system: SYSTEM,
      prompt: `Extraia a reserva desta confirmação.${text.trim() ? `\n\nTEXTO:\n${text.slice(0, 30000)}` : ""}`,
      attachments,
      effort: "low",
      maxTokens: 4000,
    });
    if (gen) {
      await supabase.from("ai_generations").update({
        status: "concluida", output: { kind: data.kind }, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
        cost_ai_cents: usage.costCents, cost_total_cents: usage.costCents, duration_ms: usage.ms,
      }).eq("id", gen.id);
    }
    return NextResponse.json({ reservation: data, model: AI_MODEL });
  } catch (e) {
    if (gen) await supabase.from("ai_generations").update({ status: "falhou", error: String((e as Error).message).slice(0, 500) }).eq("id", gen.id);
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: "A leitura automática ainda não está configurada. Preencha a reserva manualmente." }, { status: 503 });
    if (e instanceof AIRefusalError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Não consegui ler essa confirmação. Confira o arquivo ou preencha manualmente." }, { status: 500 });
  }
}
