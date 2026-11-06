// Download do relatório em PDF: o servidor abre a página do relatório num Chromium sem tela e salva em A4.
// Fica igual em qualquer aparelho (não depende da impressão do navegador do cliente).
import { NextResponse, type NextRequest } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function fileName(title: string) {
  const clean = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Viagem";
  return `Rotta 365 - ${clean} - Roteiro.pdf`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Faça login para baixar o PDF." }, { status: 401 });
  const { data: trip } = await supabase.from("trips").select("id, title").eq("id", id).maybeSingle();
  if (!trip) return NextResponse.json({ error: "Roteiro não encontrado." }, { status: 404 });

  const origin = new URL(req.url).origin;
  const host = new URL(origin).hostname;
  // a página do relatório é aberta com a mesma sessão de quem pediu o download
  const cookies = req.cookies.getAll().map((c) => ({ name: c.name, value: c.value, domain: host, path: "/", secure: origin.startsWith("https"), httpOnly: false }));

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const local = process.env.CHROME_PATH; // para testar fora da Vercel
    browser = await puppeteer.launch({
      args: local ? ["--no-sandbox", "--headless=new"] : await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      executablePath: local || (await chromium.executablePath()),
      headless: local ? true : "shell",
      defaultViewport: { width: 1200, height: 1600, deviceScaleFactor: 1 },
    });
    await browser.setCookie(...cookies);
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    const res = await page.goto(`${origin}/app/viagem/${id}/pdf`, { waitUntil: "networkidle0", timeout: 40000 });
    if (!res || !res.ok() || !page.url().includes(`/viagem/${id}/pdf`)) throw new Error(`página do relatório respondeu ${res?.status() ?? "sem resposta"}`);
    // garante as fontes da marca carregadas antes de gerar (senão sai com a fonte padrão do servidor)
    const fonts = await page.evaluate(async () => {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
      await document.fonts.ready;
      return [...document.fonts].map((f) => `${f.family.replace(/['"]/g, "")}:${f.status}`).join(",");
    });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const name = fileName(trip.title);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Report-Fonts": fonts.slice(0, 500),
      },
    });
  } catch (e) {
    console.error("pdf", e);
    return NextResponse.json({ error: "Não consegui gerar o PDF agora. Tente de novo em instantes ou use Imprimir." }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
