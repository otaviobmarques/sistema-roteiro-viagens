import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { fxToBRL } from "@/lib/context";

// Cotação para real congelada na data do gasto (RN-04).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login necessário" }, { status: 401 });
  const { data: trip } = await supabase.from("trips").select("id").eq("id", id).maybeSingle();
  if (!trip) return NextResponse.json({ error: "viagem não encontrada" }, { status: 404 });
  const url = new URL(req.url);
  const currency = (url.searchParams.get("currency") || "BRL").toUpperCase().slice(0, 3);
  const date = url.searchParams.get("date") || undefined;
  const today = new Date().toISOString().slice(0, 10);
  const rate = await fxToBRL(currency, date && date < today ? date : undefined);
  if (rate == null) return NextResponse.json({ error: "cotação indisponível" }, { status: 502 });
  return NextResponse.json({ currency, date: date ?? today, rate });
}
