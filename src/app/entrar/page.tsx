import { Logo, PinoFull } from "@/components/ui";
import { LoginForm } from "./form";
import { Credits } from "@/components/credits";

export const metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string; modo?: string; erro?: string; suspensa?: string; indicacao?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-8 md:grid-cols-2">
      <div className="hidden md:block">
        <Logo />
        <h1 className="mt-8 text-4xl font-extrabold leading-tight">Sua próxima viagem começa com <span className="text-blue">um oi pro Pino.</span></h1>
        <div className="mt-6 grid max-w-md grid-cols-3 gap-2">
          {[["< 60s", "roteiro completo e verificado"], ["3", "perfis com o preço de cada"], ["Pix", "para dividir com o grupo"]].map(([a, b]) => (
            <div key={a} className="card px-3 py-2.5"><div className="mono font-semibold text-blue">{a}</div><div className="text-xs text-gray">{b}</div></div>
          ))}
        </div>
        <PinoFull size={170} className="mt-8" />
      </div>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 md:hidden"><Logo /></div>
        {sp.indicacao && <p className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-[#0b7f84]">🎁 Você foi indicado por um amigo! Crie sua conta e ganhe <b>1 crédito extra</b> na primeira compra.</p>}
        {sp.suspensa && <p className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">Sua conta está suspensa. Fale com o suporte.</p>}
        {sp.erro && <p className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">Não foi possível entrar: {sp.erro}</p>}
        <LoginForm next={sp.next || "/app"} initialMode={sp.modo === "criar" ? "criar" : "entrar"} />
        <Credits className="mt-6 justify-center" />
      </div>
    </div>
  );
}
