"use client";
// RF-123: texto formatado do dia ou da viagem para colar no grupo do WhatsApp.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import type { Day, Item } from "@/lib/types";
import { cascade } from "@/lib/domain/schedule";
import { fmtDate } from "@/lib/domain/time";

export function WhatsAppSummary({ title, cities, days, items, pace, publicUrl }: {
  title: string; cities: string[]; days: Day[]; items: Item[]; pace: string; publicUrl: string | null;
}) {
  const [which, setWhich] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const text = useMemo(() => {
    const dayText = (d: Day, idx: number) => {
      const res = cascade(items.filter((i) => i.day_id === d.id), { date: d.date, dayStart: d.day_start || "09:00", pace });
      const head = `*Dia ${idx + 1}${d.date ? ` · ${fmtDate(d.date, true)}` : ""}*${d.title ? ` — ${d.title}` : ""}`;
      const lines = res.items.filter((i) => !["nota"].includes(i.kind)).map((i) => `${i.start} ${i.title}${i.anchor ? " 📌" : ""}`);
      return [head, ...(lines.length ? lines : ["Dia livre"])].join("\n");
    };
    if (which === "all") {
      return [
        `🗺️ *${title}*`,
        cities.length ? cities.join(" › ") : "",
        "",
        ...days.map((d, i) => dayText(d, i) + "\n"),
        publicUrl ? `Roteiro completo: ${origin}${publicUrl}` : "",
        "_Feito no Rotta 365_",
      ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
    }
    const idx = days.findIndex((d) => d.id === which);
    return `🗺️ *${title}*\n\n${dayText(days[idx], idx)}\n\n_Feito no Rotta 365_`;
  }, [which, days, items, pace, title, cities, publicUrl, origin]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="card h-fit p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold"><MessageCircle size={16} className="text-teal" /> Resumo para WhatsApp</h2>
      <p className="mb-3 text-sm text-gray">Texto pronto para colar no grupo da viagem.</p>
      <select className="input mb-3" value={which} onChange={(e) => setWhich(e.target.value)} aria-label="Escolha o dia">
        <option value="all">Viagem inteira</option>
        {days.map((d, i) => <option key={d.id} value={d.id}>Dia {i + 1}{d.date ? ` · ${fmtDate(d.date, true)}` : ""}</option>)}
      </select>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-ice p-3 text-xs">{text}</pre>
      <div className="mt-3 flex gap-2">
        <button className="btn-secondary btn-sm flex-1" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}</button>
        <a className="btn-primary btn-sm flex-1" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Abrir no WhatsApp</a>
      </div>
    </section>
  );
}
