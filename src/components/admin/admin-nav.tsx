"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/admin", label: "Métricas", exact: true },
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/roteiros", label: "Roteiros" },
  { href: "/admin/geracoes", label: "IA, pedidos e auditoria" },
  { href: "/admin/gateway", label: "Gateway e configurações" },
];

export function AdminNav() {
  const p = usePathname();
  return (
    <nav className="-mx-1 flex overflow-x-auto" aria-label="Backoffice">
      {LINKS.map((l) => {
        const active = l.exact ? p === l.href : p.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={clsx("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold", active ? "bg-blue-50 text-blue" : "text-gray hover:text-navy")}>{l.label}</Link>
        );
      })}
    </nav>
  );
}
