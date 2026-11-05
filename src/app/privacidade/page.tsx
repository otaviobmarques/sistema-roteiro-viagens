import { Logo } from "@/components/ui";

export const metadata = { title: "Privacidade (LGPD)" };

export default function Privacidade() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <article className="card mt-6 space-y-3 p-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-extrabold">Política de privacidade (rascunho)</h1>
        <p className="rounded-xl bg-warn-50 px-3 py-2 text-[#7a5212]">Versão provisória. Indicar o encarregado (DPO) e revisar com advogado antes do lançamento.</p>
        <p>Guardamos os dados da sua conta e das suas viagens para prestar o serviço. Cada viagem só é visível para as pessoas que você convidar; páginas públicas removem gastos, reservas, nomes e fotos de pessoas.</p>
        <p>Para montar roteiros, enviamos ao provedor de IA apenas destino, datas, preferências e lugares candidatos. Documentos pessoais nunca são enviados à IA. Confirmações de reserva só são lidas quando você mesmo as envia.</p>
        <p>Você pode exportar todos os seus dados em Perfil e conta. Para excluir a conta, escreva para o suporte.</p>
        <p>Dados de lugares e mapas: © colaboradores do OpenStreetMap (ODbL) e Wikidata (CC0).</p>
      </article>
    </div>
  );
}
