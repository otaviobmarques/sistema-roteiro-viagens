// Banner de link preview gerado para cada roteiro público (WhatsApp, Instagram, redes).
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAnon } from "@/lib/supabase/server";

export const alt = "Roteiro no Rotta 365";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

type T = { title: string; start_date: string | null; end_date: string | null; viability_score: number | null; destinations: { city: string; country: string | null; days: number | null }[]; days: unknown[] };

const COLORS = ["#205BFF", "#2F6BFF", "#0B7F84", "#0A1F4C", "#11C2C8", "#3A4D7A"];

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const root = process.cwd();
  const [jakarta, manrope, logo, pino] = await Promise.all([
    readFile(path.join(root, "src/assets/fonts/jakarta-800.ttf")),
    readFile(path.join(root, "src/assets/fonts/manrope-600.ttf")),
    readFile(path.join(root, "public/brand/logo.png")),
    readFile(path.join(root, "public/brand/pino.png")),
  ]);
  const { data } = await supabaseAnon().rpc("get_public_trip", { p_slug: slug });
  const t = data as T | null;
  const title = t?.title ?? "Roteiro de viagem";
  const dests = t?.destinations ?? [];
  const fromDates = t?.start_date && t?.end_date ? Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 86400000) + 1 : 0;
  const nDays = t?.days.length || dests.reduce((a, d) => a + (d.days ?? 0), 0) || fromDates;
  const fmt = (s: string | null) => (s ? s.split("-").reverse().slice(0, 2).join("/") : "");
  const src = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 64px", background: "linear-gradient(135deg, #F5F7FB 0%, #EEF3FF 60%, #E7F9FA 100%)", fontFamily: "Manrope", color: "#0A1F4C", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src(logo)} height={56} width={229} alt="" />
        <div style={{ display: "flex", marginTop: 46, fontSize: 22, color: "#5D6477", letterSpacing: 3, textTransform: "uppercase" }}>
          Roteiro · {nDays} dia{nDays === 1 ? "" : "s"}{t?.start_date ? ` · ${fmt(t.start_date)} a ${fmt(t.end_date)}` : ""}
        </div>
        <div style={{ display: "flex", fontFamily: "Jakarta", fontSize: title.length > 28 ? 64 : 80, lineHeight: 1.04, letterSpacing: -2, marginTop: 14, maxWidth: 820 }}>{title}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30, maxWidth: 820 }}>
          {dests.slice(0, 6).map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: COLORS[i % COLORS.length], color: "#fff", borderRadius: 999, padding: "10px 20px", fontSize: 26 }}>
              {d.city}{d.days ? <span style={{ opacity: 0.75 }}>{` · ${d.days}d`}</span> : null}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 18 }}>
          {t?.viability_score != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E3E8F2", borderRadius: 16, padding: "12px 18px", fontSize: 22 }}>
              <span style={{ background: "#205BFF", color: "#fff", borderRadius: 10, padding: "2px 12px", fontFamily: "Jakarta" }}>{t.viability_score}</span> viabilidade
            </div>
          )}
          <div style={{ display: "flex", fontSize: 24, color: "#5D6477" }}>Lugares verificados · copie e adapte às suas datas</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src(pino)} width={238} height={265} alt="" style={{ position: "absolute", right: 70, top: 150 }} />
        <div style={{ position: "absolute", right: 64, bottom: 54, display: "flex", background: "#fff", border: "1px solid #E3E8F2", borderRadius: 12, padding: "10px 16px", fontSize: 22 }}>rotta365.com.br</div>
      </div>
    ),
    { ...size, fonts: [{ name: "Jakarta", data: jakarta, weight: 800 }, { name: "Manrope", data: manrope, weight: 600 }] },
  );
}
