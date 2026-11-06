// Bônus: checklist de viagem montado sozinho a partir do roteiro e do guia do país (sem citar empresas).
import type { CountryGuide } from "./ai/country-guide";
import { addDays } from "./domain/time";
import type { LocalFee } from "./local-fees";
import type { SpecialNeeds } from "./ai/special";
import type { Climate } from "./ai/climate";

export type AutoCheck = { list: "pre_viagem" | "mala"; category: string; label: string; due_date: string | null };

export function buildTripChecklist(args: {
  start: string | null;
  guides: { country: string; guide: CountryGuide }[];
  cities: string[];
  international: boolean;
  weather: { rain: number | null; tmax: number | null }[];
  tickets: string[]; // atrações pagas mais importantes
  children: number;
  fees?: LocalFee[];
  needs?: SpecialNeeds;
  climates?: Climate[];
}): AutoCheck[] {
  // prazo ideal antes da ida; se já passou, vence hoje (o app mostra como "fazer agora")
  const today = new Date().toISOString().slice(0, 10);
  const due = (daysBefore: number) => {
    if (!args.start) return null;
    const d = addDays(args.start, -daysBefore);
    return d < today ? today : d;
  };
  const plugLetters = (t: string) => (t.match(/\b[A-N]\b/g) ?? []).filter((x, i, a) => a.indexOf(x) === i).join(", ");
  const currency = (t: string) => t.replace(/^moeda:\s*/i, "").split(/[.;]/)[0].trim();
  const out: AutoCheck[] = [];
  const add = (list: AutoCheck["list"], category: string, label: string, d: number | null) => out.push({ list, category, label: label.slice(0, 180), due_date: d == null ? null : due(d) });
  const g = args.guides;

  // Documentos
  if (args.international) {
    add("pre_viagem", "Documentos", "Conferir a validade e a data de emissão do passaporte", 120);
    add("pre_viagem", "Documentos", "Conferir se o passaporte tem páginas em branco suficientes", 120);
    g.forEach(({ country, guide }) => {
      const vt = guide.documents.visa_type;
      if (vt === "visto_consular") add("pre_viagem", "Documentos", `Iniciar o pedido de visto consular para ${country} (pode levar meses)`, 150);
      else if (vt === "e_visa") add("pre_viagem", "Documentos", `Pedir o visto eletrônico (e-Visa) para ${country} no site oficial`, 45);
      else if (vt === "autorizacao_eletronica") add("pre_viagem", "Documentos", `Pedir a autorização eletrônica de viagem para ${country} no site oficial do governo`, 30);
      if (guide.documents.entry_form) add("pre_viagem", "Documentos", `Preencher o formulário de entrada online para ${country}`, 3);
    });
    g.forEach(({ country }) => add("pre_viagem", "Documentos", `Confirmar as regras de entrada para ${country} (visto ou autorização eletrônica)`, 45));
    if (!g.length) add("pre_viagem", "Documentos", "Confirmar as regras de entrada do destino (visto ou autorização eletrônica)", 45);
    add("pre_viagem", "Documentos", "Separar comprovantes de hospedagem, passagem de volta e meios financeiros (a imigração pode pedir)", 3);
  } else {
    add("pre_viagem", "Documentos", "Separar documento com foto (RG ou CNH) de todos os viajantes", 2);
  }
  if (args.children > 0) add("pre_viagem", "Documentos", "Conferir a documentação das crianças (autorização de viagem, se viajarem sem um dos pais)", 20);
  add("pre_viagem", "Documentos", "Salvar no celular (e imprimir) passagens, reservas e o seguro", 2);

  // Seguro e saúde
  if (args.international) {
    const mandatory = g.some((x) => x.guide.insurance.mandatory);
    const schengenLike = g.some((x) => x.guide.insurance.mandatory && /30/.test(x.guide.insurance.requirement));
    add("pre_viagem", "Seguro e saúde", mandatory ? `Contratar o seguro viagem (pode ser exigido na entrada${schengenLike ? ": cobertura médica mínima de € 30 mil" : ""})` : "Contratar o seguro viagem com boa cobertura médica", 15);
    add("pre_viagem", "Seguro e saúde", "Ver se o seu cartão de crédito inclui seguro viagem e o que ele cobre", 20);
    g.forEach(({ country, guide }) => guide.health.agreement && add("pre_viagem", "Seguro e saúde", `Emitir antes de viajar o certificado do acordo de saúde Brasil–${country}`, 20));
    // vacinas: febre amarela (CIVP) tem regra própria; a vacina vale para o certificado 10 dias depois de tomada
    g.forEach(({ country, guide }) => {
      const yf = guide.health.yellow_fever ?? (/febre amarela/i.test(guide.health.vaccines) && /exig/i.test(guide.health.vaccines) ? "exigido" : "nao");
      if (yf === "exigido") add("pre_viagem", "Seguro e saúde", `Febre amarela: tomar a vacina pelo menos 10 dias antes e emitir o certificado internacional (CIVP) no gov.br, exigido para ${country}`, 30);
      else if (yf === "recomendado") add("pre_viagem", "Seguro e saúde", `Febre amarela: vacina recomendada para ${country}, tome pelo menos 10 dias antes`, 30);
      const rec = (guide.health.vaccines_recommended ?? []).filter((v) => !/febre amarela/i.test(v));
      if (rec.length) add("pre_viagem", "Seguro e saúde", `Vacinas recomendadas para ${country}: ${rec.slice(0, 4).join(", ")} (ver no posto de saúde)`, 30);
    });
  } else {
    add("pre_viagem", "Seguro e saúde", "Avaliar um seguro viagem nacional (cobre imprevistos e bagagem)", 10);
  }
  add("pre_viagem", "Seguro e saúde", args.international
    ? "Conferir a caderneta de vacinação no posto de saúde (com pelo menos 30 dias de antecedência)"
    : "Conferir a caderneta de vacinação: a vacina de febre amarela é recomendada em todo o Brasil (tome pelo menos 10 dias antes)", 30);
  add("pre_viagem", "Seguro e saúde", "Separar os remédios de uso contínuo, com a receita", 3);
  if (args.international) {
    add("pre_viagem", "Seguro e saúde", "Pedir ao médico a receita dos remédios controlados em inglês (ou traduzida)", 30);
    add("pre_viagem", "Seguro e saúde", "Salvar no celular o telefone 24h do seguro e o número da apólice", 2);
  }

  // Celular e internet
  if (args.international) {
    add("pre_viagem", "Celular e internet", "Escolher a internet da viagem: pacote internacional da sua operadora, eSIM ou chip local", 7);
    add("pre_viagem", "Celular e internet", "Conferir se o seu celular aceita eSIM e está desbloqueado", 7);
  }
  add("pre_viagem", "Celular e internet", `Baixar os mapas offline de ${args.cities.slice(0, 4).join(", ")}`, 1);
  if (args.international) add("pre_viagem", "Celular e internet", "Baixar e configurar antes: app de transporte, app do metrô da cidade e tradutor offline", 2);

  // Voo e hospedagem
  if (args.international) {
    add("pre_viagem", "Voo e hospedagem", "Reservar assentos e informar preferências (cama de casal, restrições alimentares) à companhia aérea e ao hotel", 15);
    add("pre_viagem", "Voo e hospedagem", "Fazer o check-in online e salvar os cartões de embarque no celular", 2);
    add("pre_viagem", "Voo e hospedagem", "Chegar ao aeroporto com 3 horas de antecedência (voo internacional)", 0);
  }

  // Dinheiro
  if (args.international) {
    [...new Set(g.map(({ guide }) => currency(guide.money.currency)))].forEach((cur) => add("pre_viagem", "Dinheiro", `Levar cartão internacional e um pouco de dinheiro em espécie: ${cur}`, 7));
    add("pre_viagem", "Dinheiro", "Comparar as formas de pagar: cartão de crédito, pré-pago ou conta em moeda estrangeira e dinheiro (IOF e câmbio)", 15);
    add("pre_viagem", "Dinheiro", "Levar dois cartões, de preferência de bandeiras diferentes (um fica de reserva)", 7);
    add("pre_viagem", "Dinheiro", "Liberar o uso do cartão no exterior no app do banco e conferir o limite", 3);
    if (g.some(({ guide }) => guide.money.tax_free)) add("pre_viagem", "Durante a viagem", "Compras: pedir o formulário de tax-free na loja e validar no aeroporto antes de despachar a mala", null);
    add("pre_viagem", "Volta", "Na volta ao Brasil: conferir a cota de isenção da Receita Federal e declarar se passar do limite", null);
    g.forEach(({ country }) => add("mala", "Alfândega", `Não levar alimentos, sementes ou produtos de origem animal sem conferir as regras de ${country}`, null));
  }

  // Necessidades especiais
  const nd = args.needs ?? {};
  if (nd.alergia) add("pre_viagem", "Necessidades especiais", "Salvar no celular o cartão de alergia traduzido (está no PDF) e avisar o hotel", 7);
  if (nd.mobilidade) add("pre_viagem", "Necessidades especiais", "Pedir assistência no aeroporto e avisar o hotel sobre a necessidade de acessibilidade", 15);
  if (nd.pet) add("pre_viagem", "Necessidades especiais", "Pet: conferir microchip, vacina antirrábica, exames e atestado veterinário internacional (comece cedo)", 120);
  if (nd.pet) add("pre_viagem", "Necessidades especiais", "Pet: confirmar com a companhia aérea as regras de cabine ou porão e reservar o lugar do animal", 30);
  if (nd.gestante) add("pre_viagem", "Necessidades especiais", "Gestante: pedir atestado médico para voar e confirmar se o seguro cobre gestação", 15);
  if (nd.esportes) add("pre_viagem", "Necessidades especiais", "Incluir cobertura para esportes radicais ou de neve no seguro viagem", 15);

  // Taxas locais (ambiental, de turismo, de acesso, de hospedagem)
  (args.fees ?? []).forEach((f) => add("pre_viagem", "Taxas locais", f.checklist, f.due));

  // Ingressos
  if (args.tickets.length) add("pre_viagem", "Ingressos", `Comprar com antecedência: ${args.tickets.slice(0, 4).join(", ")}`, 10);

  // Casa
  add("pre_viagem", "Casa", "Organizar a casa: contas, plantas, pets e lixo", 2);

  // Mala (pelo clima e pelo país)
  if (args.international) g.forEach(({ country, guide }) => { const l = plugLetters(guide.power.plugs); add("mala", "Eletrônicos", `Adaptador de tomada para ${country}${l ? ` (tipo ${l})` : ""}`, null); });
  add("mala", "Eletrônicos", "Carregador e bateria portátil", null);
  const typical = args.climates ?? [];
  const rains = [...args.weather.map((w) => w.rain ?? 0), ...typical.map((c) => (/muita/i.test(c.rain) ? 70 : /moderada/i.test(c.rain) ? 50 : 10))];
  const tmaxs = [...args.weather.map((w) => w.tmax).filter((t): t is number => t != null), ...typical.map((c) => c.tmin), ...typical.map((c) => c.tmax)];
  if (rains.some((r) => r >= 50)) add("mala", "Roupas", "Guarda-chuva ou capa de chuva (previsão de chuva em alguns dias)", null);
  if (tmaxs.length && Math.min(...tmaxs) <= 14) add("mala", "Roupas", "Casaco quente e roupas em camadas (dias frios)", null);
  if (tmaxs.length && Math.max(...tmaxs) >= 27) add("mala", "Higiene", "Protetor solar, óculos de sol e garrafinha de água", null);
  add("mala", "Roupas", "Calçado confortável para caminhar", null);

  // sem repetidos
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.list}:${x.label.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
