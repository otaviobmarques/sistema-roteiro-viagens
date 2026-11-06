// Módulos do relatório: documentos, saúde e seguro, dinheiro, celular, clima e mala, cultura, segurança,
// necessidades especiais e linha do tempo de preparação.
import type { CountryGuide, Affiliates } from "@/lib/ai/country-guide";
import type { Climate } from "@/lib/ai/climate";
import { monthName } from "@/lib/ai/climate";
import type { SpecialGuide, SpecialNeeds } from "@/lib/ai/special";
import { fmtDateShort, daysBetween } from "@/lib/domain/time";

const Sheet = ({ children }: { children: React.ReactNode }) => (
  <section className="sheet page-break mt-6 rounded-3xl border border-line bg-white p-9 shadow-[var(--shadow-card)]">{children}</section>
);
function Box({ title, badge, strong, children }: { title: string; badge?: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="avoid rounded-xl border border-line p-3.5 text-[12px] leading-snug text-navy">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold">{title}</h3>
        {badge && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${strong ? "bg-warn-50 text-warn" : "bg-blue-50 text-blue"}`}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}
const P = ({ b, children }: { b?: string; children: React.ReactNode }) => <p className="mt-1">{b && <b>{b}: </b>}{children}</p>;
const List = ({ items, ordered }: { items: string[]; ordered?: boolean }) => {
  const T = ordered ? "ol" : "ul";
  return <T className={`mt-1 space-y-0.5 pl-4 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((x) => <li key={x}>{x}</li>)}</T>;
};
const PartnerLink = ({ url, label }: { url: string; label: string }) => (
  <a href={url} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue px-2.5 py-1.5 text-[11px] font-semibold text-white">{label} <span className="rounded bg-white/20 px-1 text-[9px] uppercase tracking-wide">parceiro</span></a>
);
const Head = ({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) => (
  <div className="mb-4">
    <div className="label text-blue">{kicker}</div>
    <h2 className="font-display text-2xl font-extrabold">{title}</h2>
    {sub && <p className="mt-1 text-xs text-gray">{sub}</p>}
  </div>
);
const VISA: Record<string, string> = { isento: "Sem visto para turismo", autorizacao_eletronica: "Autorização eletrônica antes de embarcar", e_visa: "Visto eletrônico (e-Visa)", visto_consular: "Visto consular" };
const OFFICIAL = "Regras de entrada, acordos e preços mudam. Confirme nos sites oficiais (consulado e gov.br/mre) antes de viajar.";

/** Documentos e entrada · Saúde e seguro · Dinheiro e compras (página 1 do país) */
export function CountryPageOne({ country, g, aff, kids, needs }: { country: string; g: CountryGuide; aff: Affiliates; kids: number; needs: SpecialNeeds }) {
  return (
    <Sheet>
      <Head kicker="Antes de ir · 1/2" title={`${country}: documentos, saúde e dinheiro`} sub={OFFICIAL} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
        <Box title="Documentos e entrada" badge={g.documents.visa_type ? VISA[g.documents.visa_type] : undefined} strong={g.documents.visa_type === "visto_consular"}>
          <p>{g.documents.visa}</p>
          <P b="Passaporte">{g.documents.passport}</P>
          {g.documents.passport_pages && <P b="Páginas em branco">{g.documents.passport_pages}</P>}
          {g.documents.provisional_passport && <P b="Passaporte provisório">{g.documents.provisional_passport}</P>}
          {g.documents.entry_form && <P b="Formulário de entrada">{g.documents.entry_form}</P>}
          {g.documents.other && <P>{g.documents.other}</P>}
          {kids > 0 && <p className="mt-1 rounded-md bg-warn-50 px-2 py-1 font-semibold text-warn">Menores: se a criança viajar sem um dos pais (ou sem os dois), leve a autorização de viagem com firma reconhecida ou a autorização judicial. Confira as regras no site do Itamaraty.</p>}
        </Box>
        <Box title="Seguro viagem" badge={g.insurance.mandatory ? "Pode ser exigido" : "Recomendado"} strong={g.insurance.mandatory}>
          <p><b>{g.insurance.requirement}</b></p>
          <P>{g.insurance.recommended}</P>
          {needs.esportes && g.insurance.sports && <P b="Esportes">{g.insurance.sports}</P>}
          {needs.gestante && g.insurance.pregnancy && <P b="Gestantes">{g.insurance.pregnancy}</P>}
          {g.insurance.preexisting && <P b="Doenças preexistentes">{g.insurance.preexisting}</P>}
          {aff.seguro?.url && <PartnerLink url={aff.seguro.url} label={aff.seguro.label || "Cotar seguro viagem"} />}
        </Box>
        <Box title="Saúde: como funciona e como acionar o seguro">
          {g.health.care_model && <p>{g.health.care_model}</p>}
          {!!g.insurance.steps?.length && <><p className="mt-1.5 font-bold">Se precisar de atendimento:</p><List ordered items={g.insurance.steps.slice(0, 6)} /></>}
          {g.health.agreement && <P b="Acordo de saúde">{g.health.agreement}</P>}
        </Box>
        <Box title="Vacinas e remédios" badge={g.health.yellow_fever === "exigido" ? "Febre amarela exigida" : undefined} strong={g.health.yellow_fever === "exigido"}>
          {g.health.yellow_fever === "exigido" && <p className="font-semibold text-warn">Certificado internacional de vacinação (CIVP) exigido na entrada. Tome a vacina pelo menos 10 dias antes e emita o CIVP no gov.br.</p>}
          {g.health.yellow_fever === "recomendado" && <P b="Febre amarela">vacina recomendada, tome pelo menos 10 dias antes.</P>}
          <P b="Vacinas">{g.health.vaccines}</P>
          {!!g.health.vaccines_recommended?.length && <P b="Recomendadas">{g.health.vaccines_recommended.join(", ")}</P>}
          <P b="Remédios">{g.health.medicines}</P>
          {g.health.controlled_meds && <P b="Controlados">{g.health.controlled_meds}</P>}
          <p className="mt-1 text-[11px] text-gray">Exigências sanitárias (testes, surtos) podem mudar de uma semana para outra: confirme no site oficial do país.</p>
        </Box>
        <Box title="Dinheiro e compras">
          <P b="Moeda">{g.money.currency.replace(/^moeda:\s*/i, "")}</P>
          {g.money.cash_mix && <P b="Como levar">{g.money.cash_mix}</P>}
          <P>{g.money.cards}</P>
          <P b="Gorjeta">{g.money.tipping}</P>
          <p className="mt-1">Cadastre o <b>aviso de viagem</b> nos apps dos bancos para o cartão não ser bloqueado por suspeita de fraude.</p>
        </Box>
        <Box title="Tax-free e alfândega">
          {g.money.tax_free ? <P b="Tax-free">{g.money.tax_free}</P> : <P b="Tax-free">não há devolução de imposto para turistas neste país.</P>}
          {g.money.customs_destination && <P b="Ao entrar">{g.money.customs_destination}</P>}
          <P b="Na volta ao Brasil">compras acima da cota de isenção da Receita Federal pagam imposto. Se passar do limite, declare antes de sair do aeroporto.</P>
        </Box>
      </div>
    </Sheet>
  );
}

/** Celular e apps · Clima e mala · Cultura e etiqueta · Segurança e emergências (página 2 do país) */
export function CountryPageTwo({ country, g, aff, climates }: { country: string; g: CountryGuide; aff: Affiliates; climates: Climate[] }) {
  return (
    <Sheet>
      <Head kicker="Antes de ir · 2/2" title={`${country}: celular, clima, cultura e segurança`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
        <Box title="Celular e internet">
          {g.connectivity.best_option && <p><b>{g.connectivity.best_option}</b></p>}
          <P b="Pacote da sua operadora">{g.connectivity.roaming}</P>
          <P b="eSIM">{g.connectivity.esim}</P>
          <P b="Chip local">{g.connectivity.local_sim}</P>
          <p className="mt-1.5 rounded-md bg-ice px-2 py-1"><b>Seu celular aceita eSIM?</b> Disque *#06#: se aparecer um código “EID”, aceita. Ou procure “Adicionar eSIM” nos ajustes de celular/conexões. O aparelho também precisa estar desbloqueado.</p>
          {aff.esim?.url && <PartnerLink url={aff.esim.url} label={aff.esim.label || "Comprar eSIM de viagem"} />}
        </Box>
        <Box title="Apps para baixar antes de sair de casa">
          <List items={[...(g.connectivity.apps ?? []), "Mapas offline das cidades do roteiro", "App do seu banco com o aviso de viagem ativo"].slice(0, 7)} />
          <p className="mt-1 text-[11px] text-gray">Prefira os apps oficiais da cidade e do transporte público.</p>
        </Box>
        <Box title="Clima típico e o que vestir">
          {climates.length ? climates.map((c) => (
            <div key={c.city} className="mt-1 first:mt-0">
              <p><b>{c.city} em {monthName(c.month)}:</b> {Math.round(c.tmin)}° a {Math.round(c.tmax)}°C · {c.rain}</p>
              <p className="text-gray">{c.summary}</p>
            </div>
          )) : <p>Confira a previsão uma semana antes; o app mostra a previsão de cada dia.</p>}
          {climates[0]?.clothing?.length ? <><p className="mt-1.5 font-bold">Na mala:</p><List items={[...new Set(climates.flatMap((c) => c.clothing))].slice(0, 7)} /></> : null}
        </Box>
        <Box title="Cultura e etiqueta">
          {!!g.culture?.etiquette?.length && <List items={g.culture.etiquette.slice(0, 5)} />}
          {g.culture?.dress_code && <P b="Como se vestir">{g.culture.dress_code}</P>}
          <P b="Tomada">{g.power.plugs} · {g.power.voltage}. Um adaptador universal resolve.</P>
        </Box>
        <Box title="🆘 Emergências e segurança">
          <P b="Emergência">{g.emergency.number}{g.emergency.police ? ` · polícia ${g.emergency.police}` : ""}{g.emergency.ambulance ? ` · ambulância ${g.emergency.ambulance}` : ""}</P>
          {!!g.culture?.safety?.length && <List items={g.culture.safety.slice(0, 3)} />}
          {g.embassy_city && <P b="Embaixada e consulados do Brasil">{g.embassy_city}. Endereços e plantão: gov.br/mre (Portal Consular).</P>}
        </Box>
        <Box title="Se algo der errado">
          <P b="Passaporte roubado ou perdido">registre a ocorrência na polícia local e procure o consulado do Brasil para a autorização de retorno.</P>
          <P b="Cartão clonado ou perdido">bloqueie na hora pelo app do banco e ligue para a central do cartão.</P>
          <P b="Mala extraviada">antes de sair da área de esteiras, preencha o formulário de bagagem (PIR) no balcão da companhia aérea e guarde o número.</P>
        </Box>
      </div>
      {g.phrases.length > 0 && (
        <div className="avoid mt-4">
          <div className="label mb-2">Frases úteis{g.language ? ` em ${g.language.toLowerCase()}` : ""}</div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 print:grid-cols-2">
            {g.phrases.slice(0, 6).map((f) => <div key={f.pt} className="flex justify-between gap-3 border-b border-line py-1"><span className="text-gray">{f.pt}</span><b>{f.local}</b></div>)}
          </div>
        </div>
      )}
      {(aff.seguro?.url || aff.esim?.url) && <p className="mt-4 text-[10px] text-gray">Links marcados como “parceiro” podem gerar comissão para o Rotta 365, sem custo extra para você.</p>}
    </Sheet>
  );
}

/** Viagem pelo Brasil: clima, mala e o que fazer se algo der errado. */
export function DomesticPage({ climates }: { climates: Climate[] }) {
  return (
    <Sheet>
      <Head kicker="Antes de ir" title="Clima, mala e imprevistos" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
        <Box title="Clima típico e o que vestir">
          {climates.length ? climates.map((c) => <p key={c.city} className="mt-1 first:mt-0"><b>{c.city} em {monthName(c.month)}:</b> {Math.round(c.tmin)}° a {Math.round(c.tmax)}°C · {c.rain}</p>) : <p>Confira a previsão uma semana antes no app.</p>}
          {climates[0]?.clothing?.length ? <List items={[...new Set(climates.flatMap((c) => c.clothing))].slice(0, 7)} /> : null}
        </Box>
        <Box title="🆘 Se algo der errado">
          <P b="Emergência">190 polícia · 192 SAMU · 193 bombeiros</P>
          <P b="Documento perdido ou roubado">registre o boletim de ocorrência (muitos estados permitem pela internet); para voar, o boletim ajuda no embarque.</P>
          <P b="Cartão">bloqueie na hora pelo app do banco.</P>
          <P b="Mala extraviada">no voo, registre no balcão da companhia aérea antes de sair da área de esteiras.</P>
        </Box>
      </div>
    </Sheet>
  );
}

/** Necessidades especiais (só quando o cliente marcou). */
export function SpecialPage({ sg, needs }: { sg: SpecialGuide; needs: SpecialNeeds }) {
  return (
    <Sheet>
      <Head kicker="Feito para você" title="Necessidades especiais" sub="Orientações gerais: confirme com seu médico, com a companhia aérea e nos sites oficiais." />
      {!!sg.allergy_cards?.length && (
        <div className="avoid mb-4">
          <h3 className="text-sm font-extrabold">Cartão de alergia: mostre no restaurante{needs.alergia ? ` (${needs.alergia})` : ""}</h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
            {sg.allergy_cards.map((c) => (
              <div key={c.language} className="rounded-xl border-2 border-danger/40 bg-danger-50/40 p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-danger">{c.language}</div>
                <p className="mt-1 text-[15px] font-bold leading-snug text-navy">{c.text}</p>
                {c.pt !== c.text && <p className="mt-1 text-[11px] text-gray">{c.pt}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
        {!!sg.accessibility?.length && <Box title="Acessibilidade">{sg.accessibility.map((a) => <P key={a.city} b={a.city}>{a.note}</P>)}</Box>}
        {sg.pets && <Box title="Viajando com pet"><p>{sg.pets.summary}</p><List items={sg.pets.steps.slice(0, 6)} /></Box>}
        {sg.pregnancy && <Box title="Gestante"><p>{sg.pregnancy}</p></Box>}
        {sg.sports && <Box title="Esportes"><p>{sg.sports}</p></Box>}
      </div>
    </Sheet>
  );
}

/** Linha do tempo de preparação: as tarefas do checklist organizadas pelas datas. */
export function TimelinePage({ start, items }: { start: string | null; items: { label: string; list: string; due_date: string | null; done: boolean }[] }) {
  if (!start) return null;
  const pre = items.filter((i) => i.list === "pre_viagem");
  const W = [
    { id: "w90", label: "3 a 6 meses antes", min: 90 }, { id: "w45", label: "2 meses antes", min: 45 }, { id: "w15", label: "1 mês antes", min: 15 },
    { id: "w3", label: "Semana da viagem", min: 3 }, { id: "w1", label: "48 horas antes", min: 1 }, { id: "w0", label: "Dia do embarque", min: 0 },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const buckets = new Map<string, typeof pre>();
  const later: typeof pre = [];
  for (const it of pre) {
    if (!it.due_date) { later.push(it); continue; }
    const before = daysBetween(it.due_date, start);
    const w = W.find((x) => before >= x.min) ?? W[W.length - 1];
    buckets.set(w.id, [...(buckets.get(w.id) ?? []), it]);
  }
  return (
    <Sheet>
      <Head kicker="Preparação" title="Linha do tempo até o embarque" sub={`O que fazer e quando, contando da ida em ${fmtDateShort(start)}. O que já devia ter sido feito aparece com prazo de hoje (${fmtDateShort(today)}).`} />
      <ol className="relative space-y-4 border-l-2 border-blue/30 pl-5">
        {W.filter((w) => buckets.get(w.id)?.length).map((w) => (
          <li key={w.id} className="avoid relative">
            <span className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-white bg-blue shadow-[0_0_0_2px_#e3e8f2]" />
            <div className="text-sm font-extrabold text-blue">{w.label}</div>
            <ul className="mt-1 space-y-0.5 text-[12px] text-navy">{buckets.get(w.id)!.map((i) => <li key={i.label} className="flex items-start gap-1.5"><span className={`mt-0.5 h-3 w-3 shrink-0 rounded border ${i.done ? "border-ok bg-ok" : "border-gray/60"}`} />{i.label}</li>)}</ul>
          </li>
        ))}
        {later.length > 0 && (
          <li className="avoid relative">
            <span className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-white bg-teal shadow-[0_0_0_2px_#e3e8f2]" />
            <div className="text-sm font-extrabold text-[#0b7f84]">Durante a viagem e na volta</div>
            <ul className="mt-1 space-y-0.5 text-[12px] text-navy">{later.map((i) => <li key={i.label} className="flex items-start gap-1.5"><span className="mt-0.5 h-3 w-3 shrink-0 rounded border border-gray/60" />{i.label}</li>)}</ul>
          </li>
        )}
      </ol>
    </Sheet>
  );
}
