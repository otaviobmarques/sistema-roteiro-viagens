import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo, PinoFull, Notice } from "@/components/ui";

export const metadata = { title: "Convite de viagem" };

type Preview = { title: string; start_date: string | null; end_date: string | null; owner: string | null; role: string; valid: boolean } | null;

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);

export default async function ConvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { token } = await params;
  const { erro } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: preview }, { data: auth }] = await Promise.all([
    supabase.rpc("invite_preview", { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const p = preview as Preview;

  async function join() {
    "use server";
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) redirect(`/entrar?next=${encodeURIComponent(`/convite/${token}`)}`);
    const { data, error } = await sb.rpc("join_trip", { p_token: token });
    if (error || !data) redirect(`/convite/${token}?erro=1`);
    redirect(`/app/viagem/${data}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="card w-full p-6 text-center">
        <PinoFull size={110} className="mx-auto" />
        {!p ? (
          <>
            <h1 className="mt-4 text-xl font-extrabold">Convite não encontrado</h1>
            <p className="mt-2 text-sm text-gray">O link pode ter sido digitado errado ou revogado. Peça um novo link para quem organiza a viagem.</p>
            <Link href="/" className="btn-secondary mt-5">Ir para o Rotta 365</Link>
          </>
        ) : (
          <>
            <div className="label mt-4">Você foi convidado para</div>
            <h1 className="mt-1 text-2xl font-extrabold">{p.title}</h1>
            <p className="mono mt-1 text-sm text-gray">{fmt(p.start_date) ? `${fmt(p.start_date)} → ${fmt(p.end_date) ?? ""}` : "datas a definir"}</p>
            <p className="mt-3 text-sm">Convite de <b>{p.owner ?? "um amigo"}</b> como <b>{p.role === "editor" ? "editor" : "visualizador"}</b>.</p>
            {erro && <div className="mt-4"><Notice tone="danger">Não foi possível entrar com este convite. Ele pode ter expirado.</Notice></div>}
            {!p.valid ? (
              <div className="mt-4"><Notice tone="warn">Este convite expirou. Peça um novo link ao organizador.</Notice></div>
            ) : (
              <form action={join} className="mt-5">
                <button className="btn-primary w-full">{auth.user ? "Entrar na viagem" : "Entrar com minha conta"}</button>
                {!auth.user && <p className="mt-2 text-xs text-gray">Você faz login ou cria a conta em segundos e volta direto para a viagem.</p>}
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
