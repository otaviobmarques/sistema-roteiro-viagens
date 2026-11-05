import { Logo } from "@/components/ui";

export const metadata = { title: "Termos de uso" };

export default function Termos() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <article className="card mt-6 space-y-3 p-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-extrabold">Termos de uso (rascunho)</h1>
        <p className="rounded-xl bg-warn-50 px-3 py-2 text-[#7a5212]">Versão provisória para testes. Deve ser revisada por advogado antes do lançamento (seção 19 do escopo).</p>
        <p>O Rotta 365 ajuda a planejar viagens. Roteiros, horários, preços e informações de lugares são estimativas a partir de fontes abertas e podem mudar; confira com os estabelecimentos antes de ir.</p>
        <p>Roteiros completos são pagos antes da geração. Um crédito cobre a geração e os ajustes da mesma viagem (trocar itens, refazer até 3 dias, mudar o perfil e incluir até 2 destinos). Créditos de combos valem 12 meses. Se a geração falhar, nada é cobrado.</p>
        <p>A IA (o Pino) propõe; nada é alterado no roteiro sem a sua confirmação.</p>
      </article>
    </div>
  );
}
