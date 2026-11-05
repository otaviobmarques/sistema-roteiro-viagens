import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") || "/app";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/entrar?erro=${encodeURIComponent(error.message)}`, url.origin));
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: p } = await supabase.from("profiles").select("onboarded").eq("id", data.user.id).maybeSingle();
      if (p && !p.onboarded && next === "/app") return NextResponse.redirect(new URL("/app/onboarding", url.origin));
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
