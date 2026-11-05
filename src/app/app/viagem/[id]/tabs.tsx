"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function TripTabs({ id, role }: { id: string; role: string }) {
  const pathname = usePathname();
  const base = `/app/viagem/${id}`;
  const tabs = [
    { href: base, label: "Roteiro", exact: true },
    { href: `${base}/hoje`, label: "Hoje" },
    { href: `${base}/perfis`, label: "Perfis" },
    { href: `${base}/mapa`, label: "Mapa" },
    { href: `${base}/reservas`, label: "Reservas" },
    { href: `${base}/gastos`, label: "Gastos" },
    { href: `${base}/grupo`, label: "Grupo" },
    { href: `${base}/mala`, label: "Mala" },
    ...(role === "organizador" ? [{ href: `${base}/config`, label: "Configurações" }] : []),
  ];
  return (
    <nav className="-mx-4 overflow-x-auto px-4 no-print" aria-label="Seções da viagem">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} className={clsx("inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-semibold transition",
                active ? "border-blue text-blue" : "border-transparent text-gray hover:text-navy")}>{t.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
