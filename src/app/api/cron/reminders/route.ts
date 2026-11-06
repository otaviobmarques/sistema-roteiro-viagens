// Roda todo dia (Vercel Cron): envia os lembretes dos marcos 60/30/7/2/0 dias por e-mail, push e aviso no app.
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { supabaseAnon } from "@/lib/supabase/server";
import { MILESTONES, reminderEmail } from "@/lib/reminders";

export const runtime = "nodejs";
export const maxDuration = 60;

type Due = { trip_id: string; title: string; start_date: string; milestone: number; user_id: string; email: string | null; name: string | null; tasks: { label: string; due_date: string | null }[]; push: { endpoint: string; keys: { p256dh: string; auth: string } }[] };

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const secret = process.env.INTERNAL_SECRET;
  const sb = supabaseAnon();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data, error } = await sb.rpc("server_due_reminders", { p_secret: secret, p_today: today });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const due = (data ?? []) as Due[];
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://rotta365.com.br";
  const pushOn = !!(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  if (pushOn) webpush.setVapidDetails("https://rotta365.com.br", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const report: { trip: string; milestone: number; email: string; push: number }[] = [];
  for (const d of due) {
    const m = MILESTONES[d.milestone];
    if (!m) continue;
    // marca antes de enviar: se rodar duas vezes no dia, não repete
    const { data: fresh } = await sb.rpc("server_mark_reminder", { p_secret: secret, p_trip: d.trip_id, p_milestone: d.milestone, p_user: d.user_id, p_title: m.title(d.title), p_body: m.body });
    if (!fresh) continue;
    const url = d.milestone === 0 ? `${site}/app/viagem/${d.trip_id}/hoje` : `${site}/app/viagem/${d.trip_id}/mala`;
    let emailStatus = "sem e-mail";
    if (d.email && !d.email.endsWith("@usuarios.rotta365.app") && process.env.RESEND_API_KEY) {
      const e = reminderEmail({ name: d.name, tripTitle: d.title, milestone: d.milestone, tasks: d.tasks, url });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "Rotta 365 <nao-responda@rotta365.com.br>", to: [d.email], subject: e.subject, html: e.html, text: e.text }),
      }).catch(() => null);
      emailStatus = r?.ok ? "enviado" : `falhou ${r?.status ?? ""}`;
    }
    let pushed = 0;
    if (pushOn) {
      for (const s of d.push) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: m.title(d.title), body: m.push, url }));
          pushed++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.rpc("server_drop_push", { p_secret: secret, p_endpoint: s.endpoint });
        }
      }
    }
    report.push({ trip: d.trip_id, milestone: d.milestone, email: emailStatus, push: pushed });
  }
  return NextResponse.json({ today, sent: report.length, report });
}
