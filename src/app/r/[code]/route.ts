// Link de indicação: guarda o código por 30 dias e leva para criar a conta.
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const res = NextResponse.redirect(new URL("/entrar?modo=criar&indicacao=1", req.url));
  if (clean) res.cookies.set("rotta_ref", clean, { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", secure: true });
  return res;
}
