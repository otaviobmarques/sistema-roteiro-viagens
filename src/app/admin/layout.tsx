import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { Logo } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata = { title: "Backoffice" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile();
  if (!profile?.is_admin) redirect("/app");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-2.5 md:px-6">
          <Logo href="/admin" />
          <span className="rounded-full bg-navy px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">Backoffice</span>
          <AdminNav />
          <Link href="/app" className="btn-ghost btn-sm ml-auto">Voltar ao app</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
