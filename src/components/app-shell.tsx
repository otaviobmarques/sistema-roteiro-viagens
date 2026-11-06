"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  LayoutGrid, Sparkles, Compass, Store, Route, Map, Ticket, Wallet, Users, Luggage, Bell, CreditCard, User, Shield, Menu, X, Sun, Search, Plus,
} from "lucide-react";
import { Logo, PinoAvatar, Avatar } from "./ui";
import { InstallButton } from "./pwa";

type ShellProps = {
  children: React.ReactNode;
  userName: string;
  avatarUrl: string | null;
  credits: number;
  unread: number;
  isAdmin: boolean;
  currentTripId: string | null;
};

export function AppShell({ children, userName, avatarUrl, credits, unread, isAdmin, currentTripId }: ShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const tripMatch = /^\/app\/viagem\/([^/]+)/.exec(pathname);
  const tripId = tripMatch?.[1] ?? currentTripId;

  const nav = [
    { section: "Planejar", items: [
      { href: "/app", label: "Painel", icon: LayoutGrid, exact: true },
      { href: "/app/nova", label: "Criar com o Pino", icon: Sparkles },
      { href: "/app/surpreenda", label: "Me surpreenda", icon: Compass },
      { href: "/app/explorar", label: "Explorar lugares", icon: Search },
      { href: "/marketplace", label: "Marketplace", icon: Store, soon: true },
    ] },
    ...(tripId ? [{ section: "Viagem atual", items: [
      { href: `/app/viagem/${tripId}`, label: "Roteiro", icon: Route, exact: true },
      { href: `/app/viagem/${tripId}/hoje`, label: "Hoje", icon: Sun },
      { href: `/app/viagem/${tripId}/mapa`, label: "Mapa", icon: Map },
      { href: `/app/viagem/${tripId}/reservas`, label: "Reservas", icon: Ticket },
      { href: `/app/viagem/${tripId}/gastos`, label: "Gastos", icon: Wallet },
      { href: `/app/viagem/${tripId}/grupo`, label: "Grupo", icon: Users },
      { href: `/app/viagem/${tripId}/mala`, label: "Mala e checklist", icon: Luggage },
    ] }] : []),
    { section: "Conta", items: [
      { href: "/app/notificacoes", label: "Notificações", icon: Bell, badge: unread },
      { href: "/app/carteira", label: "Carteira", icon: CreditCard },
      { href: "/app/perfil", label: "Perfil e conta", icon: User },
      ...(isAdmin ? [{ href: "/admin", label: "Backoffice", icon: Shield }] : []),
    ] },
  ];

  const sidebar = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Menu principal">
      <div className="flex items-center justify-between px-1"><Logo href="/app" /></div>
      <Link href="/app/nova" className="btn-primary w-full"><Plus size={16} /> Nova viagem</Link>
      {nav.map((g) => (
        <div key={g.section}>
          <div className="label mb-1.5 px-2">{g.section}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = "exact" in it && it.exact ? pathname === it.href : pathname.startsWith(it.href);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={clsx("flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition",
                      active ? "border border-blue/20 bg-white text-blue shadow-sm" : "text-navy/80 hover:bg-white/70")}
                  >
                    <Icon size={16} />
                    <span className="flex-1">{it.label}</span>
                    {"soon" in it && it.soon && <span className="text-[10px] text-gray">em breve</span>}
                    {"badge" in it && !!it.badge && <span className="mono rounded-full bg-blue px-1.5 text-[11px] text-white">{it.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-auto space-y-2">
        <InstallButton className="btn-secondary btn-sm w-full" label="Instalar o app no celular" />
        <Link href="/app/carteira" className="pino-border flex items-center gap-2.5 rounded-xl px-3 py-2.5">
          <PinoAvatar size={30} />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Carteira</div>
            <div className="text-xs text-gray"><span className="mono">{credits}</span> crédito{credits === 1 ? "" : "s"} de roteiro</div>
          </div>
        </Link>
        <Link href="/app/perfil" className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/70">
          <Avatar name={userName} url={avatarUrl} size={30} />
          <div className="truncate text-sm font-semibold">{userName}</div>
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="app-shell min-h-dvh md:grid md:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line/70 bg-ice/70 backdrop-blur md:block no-print">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-[300px] bg-ice shadow-[var(--shadow-pop)]">
            <button className="btn-ghost absolute right-2 top-2 w-11 px-0" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line/60 bg-ice/80 px-4 py-2.5 backdrop-blur md:px-6 no-print">
          <button className="btn-ghost w-11 px-0 md:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <PinoBar tripId={tripId} />
          <Link href="/app/notificacoes" className="btn-ghost relative w-11 px-0" aria-label="Notificações">
            <Bell size={18} />
            {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue" />}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}

/** Barra do Pino (11.1): campo com borda em gradiente, atalho Ctrl/Cmd + K. */
function PinoBar({ tripId }: { tripId: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    if (tripId) {
      window.dispatchEvent(new CustomEvent("pino:ask", { detail: q }));
      router.push(`/app/viagem/${tripId}?pino=${encodeURIComponent(q)}`);
    } else {
      router.push(`/app/nova?q=${encodeURIComponent(q)}`);
    }
    setQ("");
  };
  return (
    <form onSubmit={submit} className="pino-border flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2">
      <PinoAvatar size={26} />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray/70"
        placeholder={tripId ? "Peça ao Pino: “troque o jantar de sábado por algo perto do hotel”" : "Pergunte ao Pino ou diga o que quer fazer…"}
        aria-label="Perguntar ao Pino"
      />
      <kbd className="mono hidden rounded-md border border-line px-1.5 text-[10px] text-gray sm:inline">⌘K</kbd>
      <button className="btn-primary btn-sm" type="submit">Perguntar</button>
    </form>
  );
}
