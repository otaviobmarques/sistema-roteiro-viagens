// RF-122: calendário .ics com os itens do roteiro que têm data e horário (hora local "flutuante").
import { supabaseServer } from "@/lib/supabase/server";
import { cascade } from "@/lib/domain/schedule";
import type { Item } from "@/lib/types";

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string) {
  // RFC 5545: linhas de até 75 octetos
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}
function stamp(date: string, hhmm: string) {
  return `${date.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;
}
function addMinutes(date: string, hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMinutes(h * 60 + m + mins);
  return { date: d.toISOString().slice(0, 10), hhmm: d.toISOString().slice(11, 16) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Faça login", { status: 401 });
  const { data: trip } = await supabase.from("trips").select("title, pace").eq("id", id).maybeSingle();
  if (!trip) return new Response("Viagem não encontrada", { status: 404 });
  const [{ data: days }, { data: items }] = await Promise.all([
    supabase.from("days").select("id, date, day_start, title").eq("trip_id", id).order("position"),
    supabase.from("itinerary_items").select("*").eq("trip_id", id).not("day_id", "is", null).order("position"),
  ]);

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rotta 365//Roteiros de viagem//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(trip.title)}`];
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  for (const d of days ?? []) {
    if (!d.date) continue;
    const dayItems = ((items ?? []) as Item[]).filter((i) => i.day_id === d.id);
    const res = cascade(dayItems, { date: d.date, dayStart: d.day_start || "09:00", pace: trip.pace });
    for (const it of res.items) {
      if (["nota", "livre"].includes(it.kind)) continue;
      const end = addMinutes(d.date, it.start, it.duration_min);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${it.id}@rotta365.app`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART:${stamp(d.date, it.start)}`);
      lines.push(`DTEND:${stamp(end.date, end.hhmm)}`);
      lines.push(fold(`SUMMARY:${esc(it.title)}`));
      const desc = [it.why, it.notes, it.anchor ? "Horário fixo" : null].filter(Boolean).join(" · ");
      if (desc) lines.push(fold(`DESCRIPTION:${esc(desc)}`));
      if (it.lat != null && it.lng != null) {
        lines.push(`GEO:${it.lat};${it.lng}`);
        lines.push(fold(`LOCATION:${esc(it.title)}`));
      }
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  const filename = trip.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "roteiro";
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.ics"` },
  });
}
