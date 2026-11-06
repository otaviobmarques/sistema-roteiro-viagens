"use client";
// PWA: registra o service worker e oferece "Instalar app" (Android/Chrome) ou mostra o passo a passo no iPhone.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

function useInstallState() {
  const canPrompt = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => !!deferred, () => false);
  const [env, setEnv] = useState({ standalone: false, ios: false });
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    setEnv({ standalone, ios });
  }, []);
  return { canPrompt, ...env };
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    // ao sair da conta, apaga as páginas guardadas para uso offline (aparelho compartilhado)
    const { data } = supabaseBrowser().auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT" && "caches" in window) {
        caches.keys().then((keys) => keys.filter((k) => k.endsWith("-pages")).forEach((k) => caches.delete(k)));
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}

/** Botão "Instalar app". Some quando o app já está instalado ou o navegador não permite. */
export function InstallButton({ className = "btn-secondary btn-sm", label = "Instalar app" }: { className?: string; label?: string }) {
  const { canPrompt, standalone, ios } = useInstallState();
  const [iosHelp, setIosHelp] = useState(false);
  if (standalone || (!canPrompt && !ios)) return null;
  const click = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      notify();
    } else if (ios) setIosHelp(true);
  };
  return (
    <>
      <button type="button" className={className} onClick={click}><Download size={15} /> {label}</button>
      {iosHelp && (
        <div className="fixed inset-x-3 bottom-3 z-[60] rounded-2xl border border-line bg-white p-4 text-sm shadow-[var(--shadow-pop)]" role="dialog" aria-label="Instalar no iPhone">
          <button className="absolute right-2 top-2 p-2 text-gray" onClick={() => setIosHelp(false)} aria-label="Fechar"><X size={16} /></button>
          <div className="font-bold">Instalar o Rotta 365 no iPhone</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-gray">
            <li>Toque em <Share size={14} className="inline" /> <b>Compartilhar</b>, na barra do Safari.</li>
            <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
            <li>Toque em <b>Adicionar</b>. O ícone do Rotta 365 aparece junto com seus apps.</li>
          </ol>
        </div>
      )}
    </>
  );
}
