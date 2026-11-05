"use client";
import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Check, Undo2 } from "lucide-react";
import { PinoAvatar } from "@/components/ui";

type Action = { type: string; label: string; [k: string]: unknown };
type Msg = { role: "user" | "pino"; text: string; actions?: Action[]; state?: "pendente" | "aplicado" | "descartado"; changeId?: string; appliedAt?: number };

export function PinoPanel({ tripId, dayId, initial, onClose, onApplied }: { tripId: string; dayId: string | null; initial: string | null; onClose: () => void; onApplied: () => void }) {
  const key = `pino:${tripId}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(sessionStorage.getItem(key) || "[]"); } catch { return []; }
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sentInitial = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(msgs.slice(-30))); } catch {} end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, key]);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setText("");
    setBusy(true);
    const r = await fetch(`/api/trips/${tripId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history, dayId }) });
    const d = await r.json().catch(() => ({ error: "Erro inesperado" }));
    setBusy(false);
    if (!r.ok) { setMsgs((m) => [...m, { role: "pino", text: `Ops: ${d.error}` }]); return; }
    setMsgs((m) => [...m, { role: "pino", text: d.reply, actions: d.canEdit ? d.actions : [], state: d.actions?.length ? "pendente" : undefined }]);
  };

  useEffect(() => {
    if (initial && !sentInitial.current) { sentInitial.current = true; send(initial); }
    const onAsk = (e: Event) => send((e as CustomEvent<string>).detail);
    window.addEventListener("pino:ask", onAsk);
    return () => window.removeEventListener("pino:ask", onAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = async (idx: number) => {
    const m = msgs[idx];
    const r = await fetch(`/api/trips/${tripId}/chat/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actions: m.actions }) });
    const d = await r.json();
    if (!r.ok) { setMsgs((ms) => [...ms, { role: "pino", text: `Ops: ${d.error}` }]); return; }
    setMsgs((ms) => ms.map((x, i) => (i === idx ? { ...x, state: "aplicado", changeId: d.changeId, appliedAt: Date.now() } : x)));
    onApplied();
  };
  const undo = async (idx: number) => {
    const m = msgs[idx];
    const r = await fetch(`/api/trips/${tripId}/chat/apply`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeId: m.changeId }) });
    const d = await r.json();
    if (!r.ok) { setMsgs((ms) => [...ms, { role: "pino", text: d.error }]); return; }
    setMsgs((ms) => ms.map((x, i) => (i === idx ? { ...x, state: "descartado" } : x)));
    onApplied();
  };

  return (
    <div className="glass pino-border flex h-full flex-col overflow-hidden rounded-2xl bg-white/95">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <PinoAvatar size={30} />
        <div className="flex-1 leading-tight"><div className="text-sm font-bold">Pino</div><div className="text-[11px] text-gray">assistente de IA · nada muda sem você confirmar</div></div>
        <button className="btn-ghost btn-sm w-9 px-0" onClick={onClose} aria-label="Fechar Pino"><X size={16} /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <div className="space-y-2 text-sm">
            <p>Oi! Posso trocar lugares, encaixar um “não abro mão”, deixar o dia mais leve ou responder dúvidas da viagem.</p>
            {["Troque o jantar por algo perto do último passeio", "Deixe este dia mais leve", "O que fazer se chover?", "Lembrei: quero incluir um mirante"].map((s) => (
              <button key={s} className="chip min-h-8 text-left" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
            {m.role === "pino" && <PinoAvatar mood={m.actions?.length ? "achei" : "oi"} size={24} />}
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-blue text-white" : "bg-ice"}`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.actions.map((a, j) => <div key={j} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs"><b className="uppercase text-blue">{a.type === "add" ? "+ " : a.type === "remove" ? "− " : "↺ "}</b>{a.label}</div>)}
                  {m.state === "pendente" && <div className="flex gap-2 pt-1"><button className="btn-primary btn-sm" onClick={() => apply(i)}><Check size={13} /> Aplicar</button><button className="btn-secondary btn-sm" onClick={() => setMsgs((ms) => ms.map((x, k) => (k === i ? { ...x, state: "descartado" } : x)))}>Descartar</button></div>}
                  {m.state === "aplicado" && <div className="flex items-center gap-2 pt-1 text-xs text-ok">Aplicado. {m.appliedAt && Date.now() - m.appliedAt < 15 * 60000 && <button className="inline-flex items-center gap-1 font-semibold text-blue" onClick={() => undo(i)}><Undo2 size={12} /> Desfazer (15 min)</button>}</div>}
                  {m.state === "descartado" && <div className="pt-1 text-xs text-gray">Descartado.</div>}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-gray"><Loader2 size={14} className="animate-spin" /> Pino está pensando…</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Peça ao Pino…" aria-label="Mensagem para o Pino" />
        <button className="btn-primary w-11 px-0" aria-label="Enviar" disabled={busy}><Send size={16} /></button>
      </form>
    </div>
  );
}
