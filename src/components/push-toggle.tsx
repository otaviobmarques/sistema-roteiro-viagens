"use client";
// Ativar lembretes da viagem no celular (notificações push do app instalado).
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const key = () => {
  const b64 = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function PushToggle({ userId }: { userId: string }) {
  const [state, setState] = useState<"carregando" | "sem_suporte" | "ios" | "off" | "on" | "negado">("carregando");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) { setState(ios && !standalone ? "ios" : "sem_suporte"); return; }
    if (Notification.permission === "denied") { setState("negado"); return; }
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => setState("sem_suporte"));
  }, []);
  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "negado" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
      const j = sub.toJSON();
      await supabaseBrowser().from("push_subscriptions").upsert({ endpoint: sub.endpoint, user_id: userId, keys: j.keys });
      setState("on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await supabaseBrowser().from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    setState("off");
    setBusy(false);
  };
  if (state === "carregando") return null;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      {state === "on" ? <Bell size={18} className="text-blue" /> : <BellOff size={18} className="text-gray" />}
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-bold">Lembretes da viagem no celular</div>
        <div className="text-xs text-gray">
          {state === "on" && "Ativados: você recebe os lembretes 60, 30 e 7 dias antes, 48 horas antes e no dia da viagem."}
          {state === "off" && "Receba no celular o que fazer 60, 30 e 7 dias antes, 48 horas antes e no dia. Por e-mail eles já chegam."}
          {state === "ios" && "No iPhone: instale o app (Compartilhar → Adicionar à Tela de Início), abra por ele e ative aqui."}
          {state === "negado" && "As notificações estão bloqueadas para o Rotta 365 nas configurações do navegador."}
          {state === "sem_suporte" && "Este navegador não recebe notificações. Os lembretes chegam por e-mail e aqui no app."}
        </div>
      </div>
      {state === "off" && <button className="btn-primary btn-sm" onClick={enable} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Ativar</button>}
      {state === "on" && <button className="btn-ghost btn-sm" onClick={disable} disabled={busy}>Desativar</button>}
    </div>
  );
}
