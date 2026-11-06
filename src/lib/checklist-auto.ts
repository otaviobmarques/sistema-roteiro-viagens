// Bônus: checklist de viagem montado sozinho a partir do roteiro e do guia do país (sem citar empresas).
import type { CountryGuide } from "./ai/country-guide";
import { addDays } from "./domain/time";

export type AutoCheck = { list: "pre_viagem" | "mala"; category: string; label: string; due_date: string | null };

export function buildTripChecklist(args: {
  start: string | null;
  guides: { country: string; guide: CountryGuide }[];
  cities: string[];
  international: boolean;
  weather: { rain: number | null; tmax: number | null }[];
  tickets: string[]; // atrações pagas mais importantes
  children: number;
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
    add("pre_viagem", "Documentos", "Conferir a validade e a data de emissão do passaporte", 60);
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
    g.forEach(({ country, guide }) => !/nenhuma/i.test(guide.health.vaccines) && add("pre_viagem", "Seguro e saúde", `Ver no posto de saúde as vacinas para ${country}`, 30));
  } else {
    add("pre_viagem", "Seguro e saúde", "Avaliar um seguro viagem nacional (cobre imprevistos e bagagem)", 10);
  }
  add("pre_viagem", "Seguro e saúde", "Separar os remédios de uso contínuo, com a receita", 3);

  // Celular e internet
  if (args.international) {
    add("pre_viagem", "Celular e internet", "Escolher a internet da viagem: pacote internacional da sua operadora, eSIM ou chip local", 7);
    add("pre_viagem", "Celular e internet", "Conferir se o seu celular aceita eSIM e está desbloqueado", 7);
  }
  add("pre_viagem", "Celular e internet", `Baixar os mapas offline de ${args.cities.slice(0, 4).join(", ")}`, 1);

  // Dinheiro
  if (args.international) {
    [...new Set(g.map(({ guide }) => currency(guide.money.currency)))].forEach((cur) => add("pre_viagem", "Dinheiro", `Levar cartão internacional e um pouco de dinheiro em espécie (${cur})`, 7));
    add("pre_viagem", "Dinheiro", "Liberar o uso do cartão no exterior no app do banco", 3);
  }

  // Ingressos
  if (args.tickets.length) add("pre_viagem", "Ingressos", `Comprar com antecedência: ${args.tickets.slice(0, 4).join(", ")}`, 10);

  // Casa
  add("pre_viagem", "Casa", "Organizar a casa: contas, plantas, pets e lixo", 2);

  // Mala (pelo clima e pelo país)
  if (args.international) g.forEach(({ country, guide }) => { const l = plugLetters(guide.power.plugs); add("mala", "Eletrônicos", `Adaptador de tomada para ${country}${l ? ` (tipo ${l})` : ""}`, null); });
  add("mala", "Eletrônicos", "Carregador e bateria portátil", null);
  const rains = args.weather.map((w) => w.rain ?? 0);
  const tmaxs = args.weather.map((w) => w.tmax).filter((t): t is number => t != null);
  if (rains.some((r) => r >= 50)) add("mala", "Roupas", "Guarda-chuva ou capa de chuva (previsão de chuva em alguns dias)", null);
  if (tmaxs.length && Math.min(...tmaxs) <= 14) add("mala", "Roupas", "Casaco quente e roupas em camadas (dias frios)", null);
  if (tmaxs.length && Math.max(...tmaxs) >= 27) add("mala", "Higiene", "Protetor solar, óculos de sol e garrafinha de água", null);
  add("mala", "Roupas", "Calçado confortável para caminhar", null);

  // sem repetidos
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.list}:${x.label.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
