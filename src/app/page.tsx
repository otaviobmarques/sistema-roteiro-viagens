import Link from "next/link";
import { Logo, PinoFull, PinoAvatar } from "@/components/ui";
import { Route, TrendingUp, Star, Users, ShieldCheck, Sparkles, Wallet, Sun } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-xl border border-line bg-white/80 p-1 text-sm md:flex" aria-label="Seções">
          <a href="#como" className="rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50">Como funciona</a>
          <a href="#recursos" className="rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50">Recursos</a>
          <a href="#pro" className="rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50">Para agências</a>
          <a href="#precos" className="rounded-lg px-3 py-1.5 font-medium hover:bg-blue-50">Preços</a>
        </nav>
        <div className="flex gap-2">
          <Link href="/entrar" className="btn-secondary btn-sm">Entrar</Link>
          <Link href="/entrar?modo=criar" className="btn-primary btn-sm">Começar grátis</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-6 md:grid-cols-[1.1fr_1fr] md:pt-12">
        <div>
          <span className="chip mb-4 border-blue/20 bg-blue-50 text-blue"><span className="h-1.5 w-1.5 rounded-full bg-blue" /> Novo · roteiros multidestino</span>
          <h1 className="text-4xl font-extrabold leading-[1.05] md:text-6xl">
            Diga os países.<br /><span className="text-blue">O Pino monta a viagem.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-gray md:text-lg">
            Portugal + Espanha + Itália em 20 dias? O Rotta 365 decide a ordem, quantos dias em cada lugar, o que vale ver e quanto custa nos perfis
            Mochilão, Clássica ou Experiência. Só lugares reais e verificados.
          </p>
          <form action="/app/nova" className="pino-border mt-6 flex items-center gap-2 rounded-2xl p-2">
            <PinoAvatar size={32} />
            <input name="q" className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" placeholder="20 dias na Europa em junho, amo comer bem e montanha" aria-label="Descreva sua viagem" />
            <button className="btn-primary btn-sm">Montar</button>
          </form>
          <p className="mt-2 text-xs text-gray">Prévia grátis · você só paga pelo roteiro completo</p>
          <div className="mt-6 grid max-w-md grid-cols-3 gap-2">
            {[["< 60 s", "roteiro completo e verificado"], ["3", "perfis com o preço de cada"], ["Pix", "para dividir com o grupo"]].map(([a, b]) => (
              <div key={a} className="card px-3 py-2.5"><div className="mono text-lg font-semibold text-blue">{a}</div><div className="text-xs text-gray">{b}</div></div>
            ))}
          </div>
        </div>
        <div className="relative flex justify-center lg:justify-end">
          <div className="card w-full max-w-md p-4">
            <div className="flex items-center justify-between"><span className="label">Europa · 20 dias</span><span className="mono rounded-lg bg-blue px-2 py-0.5 text-sm font-semibold text-white">94</span></div>
            <div className="mt-3 flex overflow-hidden rounded-lg text-[11px] font-semibold text-white">
              <div className="flex-[6] bg-blue px-2 py-1.5">PT 6</div><div className="flex-[6] bg-[#2f6bff] px-2 py-1.5">ES 6</div><div className="flex-[8] bg-[#0b7f84] px-2 py-1.5">IT 8</div>
            </div>
            <div className="mt-4 space-y-2">
              {[["09:00", "Palácio da Pena", "9,3"], ["12:30", "Almoço · Tascantiga", "8,6"], ["14:15", "Quinta da Regaleira", "9,5"]].map(([h, t, s]) => (
                <div key={t} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <span className="mono text-sm font-semibold">{h}</span><span className="flex-1 text-sm font-medium">{t}</span><span className="mono rounded-md bg-blue-50 px-1.5 text-xs font-semibold text-blue">{s}</span>
                </div>
              ))}
            </div>
            <div className="glass mt-3 flex items-center gap-2 p-3 text-sm"><PinoAvatar mood="partiu" size={28} /><div><b>Partiu!</b> Saia em 12 min · trem para Sintra</div></div>
          </div>
          <PinoFull size={130} className="absolute -bottom-10 left-0 hidden drop-shadow-xl lg:block" />
        </div>
      </section>

      <section id="como" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-extrabold md:text-3xl">Como funciona</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["1", "Conte o que você quer", "Destinos, datas, quem vai, o que vocês amam e o que não abrem mão. Leva um minuto."],
            ["2", "O Pino monta e confere", "Ordem dos destinos, divisão dos dias, horários em cascata e cada lugar verificado, com score de viabilidade."],
            ["3", "Viaje com tudo na mão", "Grupo editando junto, gastos divididos com Pix, mala sugerida e o modo Hoje com a hora de sair."],
          ].map(([n, t, d]) => (
            <div key={n} className="card p-5"><div className="mono flex h-8 w-8 items-center justify-center rounded-lg bg-blue text-white">{n}</div><h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-sm text-gray">{d}</p></div>
          ))}
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-extrabold md:text-3xl">Tudo que uma viagem precisa, <span className="text-blue">num app só</span></h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Route, "Multidestino inteligente", "Ordem dos países, dias em cada um e trechos de trem e avião calculados."],
            [Star, "Score para você", "Nota de 0 a 10 que junta qualidade e o quanto combina com você."],
            [ShieldCheck, "Motor de agenda", "Horários em cascata, âncoras fixas e alerta de conflito antes de dar errado."],
            [Users, "Grupo e Pix", "Todo mundo edita junto, vota e acerta as contas com um toque."],
            [Sparkles, "Me surpreenda", "Não sabe para onde ir? O Pino sugere destinos pela ocasião."],
            [Wallet, "Três perfis de preço", "Mochilão, Clássica e Experiência lado a lado, com o custo de cada."],
            [Sun, "Modo Hoje", "Próximo compromisso, hora de sair e navegação no celular."],
            [TrendingUp, "Brasil em primeiro lugar", "Português, real, Pix, WhatsApp e feriados nacionais."],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof Route;
            return (
              <div key={t as string} className="card p-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue"><I size={18} /></span><h3 className="mt-3 text-sm font-bold">{t as string}</h3><p className="mt-1 text-xs text-gray">{d as string}</p></div>
            );
          })}
        </div>
      </section>

      <section id="pro" className="mx-auto max-w-6xl px-4 py-10">
        <div className="hero-gradient grid gap-6 rounded-3xl p-6 text-white md:grid-cols-[1.4fr_1fr] md:p-10">
          <div>
            <div className="label text-white/70">Rotta 365 Pro</div>
            <h2 className="mt-2 text-2xl font-extrabold md:text-3xl">Para agências: proposta com a sua marca em minutos</h2>
            <p className="mt-2 text-white/85">Funil de vendas, proposta com IA em três faixas de preço, link de aprovação, contrato e sinal via Pix. O cliente viaja com o app.</p>
            <span className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue">Em breve · lista de espera</span>
          </div>
          <div className="grid grid-cols-2 gap-3 self-center">
            <div className="rounded-2xl bg-white/12 p-4"><div className="mono text-2xl font-semibold">3</div><div className="text-xs text-white/80">faixas de preço por proposta</div></div>
            <div className="rounded-2xl bg-white/12 p-4"><div className="mono text-2xl font-semibold">Pix</div><div className="text-xs text-white/80">sinal e parcelamento</div></div>
          </div>
        </div>
      </section>

      <section id="precos" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-extrabold md:text-3xl">Pague só pelo roteiro que você quer</h2>
        <p className="mt-1 text-sm text-gray">Planejar manualmente, convidar o grupo, dividir gastos, Pix, mala e checklist são grátis.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Prévia", "Grátis", "Sugestões de destino, divisão dos dias e resumo do roteiro."],
            ["Avulso", "R$ 29,90", "1 roteiro completo + PDF, com ajustes inclusos."],
            ["Combo 5", "R$ 139", "R$ 27,80 por roteiro · válido 12 meses.", true],
            ["Combo 10", "R$ 249", "R$ 24,90 por roteiro · para quem viaja muito."],
          ].map(([n, p, d, hl]) => (
            <div key={n as string} className={`card p-5 ${hl ? "ring-2 ring-teal" : ""}`}>
              <div className="flex items-center justify-between"><span className="label">{n as string}</span>{hl && <span className="chip text-[10px]">mais escolhido</span>}</div>
              <div className="mono mt-2 text-2xl font-semibold">{p as string}</div>
              <p className="mt-1 text-xs text-gray">{d as string}</p>
              <Link href="/entrar?modo=criar" className={`${hl ? "btn-primary" : "btn-secondary"} btn-sm mt-4 w-full`}>{n === "Prévia" ? "Começar" : "Comprar"}</Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-gray">
        <span>Rotta 365 · Roteiros de viagem</span>
        <span>Mapas © OpenStreetMap · <Link href="/termos" className="underline">Termos</Link> · <Link href="/privacidade" className="underline">Privacidade (LGPD)</Link></span>
      </footer>
    </div>
  );
}
