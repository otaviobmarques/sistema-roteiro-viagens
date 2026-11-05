import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { askJSON, AIUnavailableError } from "@/lib/ai/claude";

const Schema = z.object({
  destinations: z.array(z.string()).describe("cidades ou países citados, na ordem citada"),
  total_days: z.number().int().nullable(),
  start_date: z.string().nullable().describe("YYYY-MM-DD se der para inferir (ex.: 'em junho' → dia 1 do próximo junho)"),
  adults: z.number().int().nullable(),
  children: z.number().int().nullable(),
  profile: z.enum(["mochilao", "classica", "experiencia"]).nullable(),
  interests: z.array(z.enum(["natureza", "cultura", "gastronomia", "praia", "noite", "compras", "bem_estar", "arte", "local", "fotografia"])),
  must_haves: z.array(z.string()),
  occasion: z.string().nullable(),
  notes: z.string().nullable(),
});

/** Transforma o texto livre da barra do Pino em campos do questionário (o usuário revisa antes). */
export async function POST(req: Request) {
  await requireUser();
  const { q } = await req.json();
  if (!q || typeof q !== "string" || q.length > 600) return NextResponse.json({ error: "texto inválido" }, { status: 400 });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await askJSON({
      schema: Schema,
      system: "Extraia os campos de um pedido de viagem em português. Se um país for citado sem cidade, mantenha o país. Não invente o que não foi dito.",
      prompt: `Hoje é ${today}. Pedido: """${q}"""`,
      effort: "low",
      maxTokens: 2000,
    });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
