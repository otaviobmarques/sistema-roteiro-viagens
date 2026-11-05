"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, CheckCheck, CreditCard, CloudRain, Users, Clock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState, Pill } from "@/components/ui";

type N = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const ICON: Record<string, typeof Bell> = { pagamento: CreditCard, clima: CloudRain, convite: Users, saida: Clock };

const EVENTS = [
  { id: "convite", label: "Convites e menções" },
  { id: "roteiro", label: "Mudanças no roteiro e enquetes" },
  { id: "saida", label: "Hora de sair e check-in" },
  { id: "cancelamento", label: "Cancelamento grátis acabando" },
  { id: "clima", label: "Alertas de clima" },
  { id: "pagamento", label: "Pagamentos e créditos" },
];

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function NotificationsList({ initial }: { initial: N[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((s) => s.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    await supabaseBrowser().from("notifications").update({ read_at: now }).in("id", ids);
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Caixa de entrada {unread > 0 && <Pill tone="blue">{unread} nova{unread > 1 ? "s" : ""}</Pill>}</h2>
          <button className="btn-ghost btn-sm" disabled={!unread} onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}><CheckCheck size={14} /> Marcar todas como lidas</button>
        </div>
        {!items.length ? (
          <EmptyState title="Tudo tranquilo por aqui" text="Avisos de convites, pagamentos, clima e hora de sair aparecem aqui." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const Icon = ICON[n.kind] ?? Bell;
              const content = (
                <div className="flex gap-3 py-3">
                  <span className={clsx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.read_at ? "bg-ice text-gray" : "bg-blue-50 text-blue")}><Icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className={clsx("text-sm", n.read_at ? "font-medium" : "font-bold")}>{n.title}</div>
                    {n.body && <div className="text-sm text-gray">{n.body}</div>}
                    <div className="mono mt-0.5 text-xs text-gray">{ago(n.created_at)}</div>
                  </div>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue" aria-label="não lida" />}
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => markRead([n.id])} className="block rounded-lg hover:bg-ice/60">{content}</Link>
                  ) : (
                    <button className="block w-full rounded-lg text-left hover:bg-ice/60" onClick={() => markRead([n.id])}>{content}</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-bold">Preferências</h2>
        <p className="mb-3 text-sm text-gray">Escolha por onde receber cada aviso.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left"><th className="label py-2 font-semibold">Evento</th><th className="label px-2 text-center">App</th><th className="label px-2 text-center">E-mail</th><th className="label px-2 text-center">WhatsApp</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {EVENTS.map((e) => (
                <tr key={e.id}>
                  <td className="py-2.5 pr-2">{e.label}</td>
                  <td className="text-center"><input type="checkbox" defaultChecked aria-label={`${e.label} no app`} className="h-4 w-4 accent-[#205BFF]" /></td>
                  <td className="text-center"><input type="checkbox" defaultChecked={e.id === "pagamento" || e.id === "convite"} aria-label={`${e.label} por e-mail`} className="h-4 w-4 accent-[#205BFF]" /></td>
                  <td className="text-center"><input type="checkbox" disabled aria-label={`${e.label} por WhatsApp (em breve)`} className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray">WhatsApp chega em breve. A gravação das preferências por canal entra na próxima versão.</p>
      </section>
    </div>
  );
}
