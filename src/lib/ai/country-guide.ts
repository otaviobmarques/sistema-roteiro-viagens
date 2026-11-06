// Guia "Antes de ir" por país para o viajante brasileiro: seguro viagem, saúde, celular, dinheiro, tomada e documentos.
// Gerado uma vez por país (cache em country_guides, renovado a cada 90 dias) e reaproveitado em todos os roteiros.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { askJSON } from "./claude";
import { supabaseAnon } from "../supabase/server";

const GuideSchemaA = z.object({
  country_name: z.string().describe("nome do país em português"),
  insurance: z.object({
    mandatory: z.boolean().describe("seguro viagem é exigido na entrada para brasileiros"),
    requirement: z.string().describe("regra de entrada sobre seguro (ex.: cobertura mínima); se não for exigido, diga isso"),
    recommended: z.string().describe("cobertura médica recomendada para esse país e por quê, em até 25 palavras"),
    tips: z.array(z.string()).describe("até 3 dicas curtas: o que cobrir, cartão de crédito com seguro, esportes"),
    steps: z.array(z.string()).describe("passo a passo para acionar o seguro nesse país (4 a 6 passos curtos: ligar para a central 24h antes de ir ao hospital, número da apólice, guardar recibos e laudos, reembolso)"),
    sports: z.string().describe("cobertura para esportes radicais ou de neve nesse destino, em até 20 palavras"),
    pregnancy: z.string().describe("cuidados de seguro e viagem para gestantes nesse destino, em até 20 palavras"),
    preexisting: z.string().describe("o que observar sobre doenças preexistentes no seguro, em até 20 palavras"),
  }),
  health: z.object({
    summary: z.string().describe("como funciona o atendimento médico para turistas e custo, em até 30 palavras"),
    agreement: z.string().nullable().describe("acordo de saúde Brasil–país (ex.: certificado emitido antes da viagem); null se não houver"),
    vaccines: z.string().describe("vacinas exigidas ou recomendadas (ex.: febre amarela); 'nenhuma exigida' se for o caso"),
    yellow_fever: z.enum(["exigido", "recomendado", "nao"]).describe("certificado internacional de vacinação contra febre amarela (CIVP) para quem chega do Brasil: exigido na entrada, apenas recomendado, ou não"),
    vaccines_recommended: z.array(z.string()).describe("vacinas recomendadas além das de rotina (ex.: hepatite A, febre tifoide); [] se nenhuma"),
    medicines: z.string().describe("cuidado com remédios na bagagem, em até 20 palavras"),
    care_model: z.string().describe("como funciona o atendimento: rede pública, privada, pagamento na hora e reembolso pelo seguro ou atendimento direto pela rede credenciada; em até 30 palavras"),
    controlled_meds: z.string().describe("regras para remédios controlados: receita em inglês ou traduzida, quantidade, declaração na alfândega; em até 30 palavras"),
  }),
  documents: z.object({
    visa: z.string().describe("visto ou autorização eletrônica para brasileiros (ex.: ETIAS, ESTA), em até 28 palavras"),
    passport: z.string().describe("validade mínima do passaporte e outros documentos"),
    other: z.string().nullable().describe("outra exigência importante (comprovantes, menores viajando); null se não houver"),
    visa_type: z.enum(["isento", "autorizacao_eletronica", "e_visa", "visto_consular"]).describe("o que o brasileiro precisa para turismo: isento, autorização eletrônica prévia (ex.: ESTA, eTA), visto eletrônico (e-Visa) ou visto consular"),
    passport_pages: z.string().describe("páginas em branco exigidas no passaporte, em até 15 palavras"),
    provisional_passport: z.string().describe("se o passaporte de emergência/provisório é aceito, em até 15 palavras"),
    entry_form: z.string().nullable().describe("formulário de entrada/imigração para preencher antes (online), ou null"),
  }),
});
const GuideSchemaB = z.object({
  money: z.object({
    currency: z.string().describe("moeda e câmbio aproximado em reais"),
    cards: z.string().describe("aceitação de cartão, saque, IOF e conta/cartão em moeda estrangeira (sem citar bancos ou marcas), em até 25 palavras"),
    tipping: z.string().describe("costume de gorjeta, em até 18 palavras"),
    cash_mix: z.string().describe("mix recomendado: quanto em espécie, quanto em conta/cartão em moeda estrangeira e quanto no crédito, em até 30 palavras"),
    tax_free: z.string().nullable().describe("devolução de imposto nas compras (tax-free): compra mínima, formulário na loja, onde validar no aeroporto antes de despachar; null se não existir"),
    customs_destination: z.string().describe("o que é proibido ou restrito levar para esse país (alimentos de origem animal ou vegetal, sementes, valores em espécie acima do limite), em até 30 palavras"),
  }),
  connectivity: z.object({
    roaming: z.string().describe("como funciona usar o pacote internacional da operadora brasileira nesse país (sem citar marcas), em até 22 palavras"),
    esim: z.string().describe("eSIM de viagem: vale a pena, cobertura, faixa de preço típica (sem citar marcas), em até 22 palavras"),
    local_sim: z.string().describe("chip local: onde comprar (aeroporto, lojas oficiais, bancas), o que pedem, sem citar marcas, em até 22 palavras"),
    tip: z.string().describe("dica prática de internet/ligações, em até 18 palavras"),
    best_option: z.string().describe("qual costuma valer mais a pena nesse país para uma viagem curta: eSIM, chip local ou pacote da operadora, e por quê, em até 25 palavras"),
    apps: z.array(z.string()).describe("4 a 6 TIPOS de app para baixar antes (ex.: app de transporte por aplicativo, app oficial do metrô da cidade, tradutor offline, mapas offline), sem citar marcas"),
  }),
  power: z.object({ plugs: z.string().describe("tipos de tomada (letras) e se precisa de adaptador vindo do Brasil"), voltage: z.string() }),
  emergency: z.object({ number: z.string().describe("número geral de emergência"), police: z.string().nullable(), ambulance: z.string().nullable() }),
  phrases: z.array(z.object({ pt: z.string(), local: z.string() })).describe("5 frases úteis no idioma local; [] se o idioma for português"),
  culture: z.object({
    etiquette: z.array(z.string()).describe("4 a 5 costumes e regras de etiqueta importantes para o turista"),
    dress_code: z.string().describe("como se vestir em igrejas, templos e restaurantes mais formais, em até 25 palavras"),
    safety: z.array(z.string()).describe("3 dicas de segurança para turistas (golpes comuns, áreas, transporte)"),
  }),
  embassy_city: z.string().describe("cidade onde fica a Embaixada do Brasil nesse país e outras com consulado, em até 15 palavras"),
  language: z.string().describe("idioma principal falado no país"),
});
const GuideSchema = GuideSchemaA.merge(GuideSchemaB);
export type CountryGuide = z.infer<typeof GuideSchema>;

export const normCountry = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const isBrazil = (c: string) => /^(brasil|brazil|br)$/.test(normCountry(c));
const MAX_AGE_DAYS = 90;
const GUIDE_VERSION = 2; // sobe quando o formato do guia muda (o cache antigo é refeito)

// Regras fixas (não dependem da IA): Espaço Schengen e acordos de saúde do Brasil
const SCHENGEN = new Set(["alemanha", "austria", "belgica", "bulgaria", "croacia", "dinamarca", "eslovaquia", "eslovenia", "espanha", "estonia", "finlandia", "franca", "grecia", "holanda", "paises baixos", "hungria", "islandia", "italia", "letonia", "liechtenstein", "lituania", "luxemburgo", "malta", "noruega", "polonia", "portugal", "republica tcheca", "tchequia", "romenia", "suecia", "suica"]);
const HEALTH_AGREEMENT = new Set(["portugal", "italia", "cabo verde"]);
function applyFixedRules(country: string, g: CountryGuide): CountryGuide {
  const k = normCountry(country);
  if (SCHENGEN.has(k)) {
    g.insurance.mandatory = true;
    g.insurance.requirement = "País do Espaço Schengen: a imigração pode exigir seguro viagem com cobertura médica mínima de € 30 mil, válido em todo o Espaço Schengen e por toda a estadia. Leve a apólice impressa ou no celular.";
  }
  if (HEALTH_AGREEMENT.has(k) && !g.health.agreement) {
    g.health.agreement = "O Brasil tem acordo de saúde com este país: antes de viajar, peça o Certificado de Direito à Assistência Médica (CDAM) no gov.br para ser atendido na rede pública. Ele não substitui o seguro viagem; confirme as regras no gov.br.";
  }
  return g;
}

async function generate(country: string): Promise<CountryGuide> {
  const ask = <S extends z.ZodType>(schema: S, part: string) => askJSON({
    schema,
    effort: "low",
    maxTokens: 4000,
    system: "Você é o Pino, guia de viagem do Rotta 365. Escreve para turistas brasileiros, em português do Brasil, de forma curta, prática e correta. Quando uma regra puder ter mudado recentemente, diga para confirmar no site oficial; nunca invente números ou exigências. Inclua só informações de que você tem certeza; na dúvida, deixe o item de fora ou seja genérico. Nunca cite nomes de empresas, marcas, operadoras, bancos ou aplicativos comerciais: fale da categoria (\"sua operadora\", \"um eSIM de viagem\", \"app de transporte\"). Programas oficiais de governo (ex.: autorização eletrônica de viagem) podem ser citados.",
    prompt: `Monte o guia "antes de ir" (${part}) para um turista brasileiro que vai viajar para: ${country}.`,
  });
  // o formato completo é grande demais para uma resposta só: duas partes em paralelo
  const [ra, rb] = await Promise.all([ask(GuideSchemaA, "documentos, seguro e saúde"), ask(GuideSchemaB, "dinheiro, celular, tomada, emergência, frases, cultura e embaixada")]);
  const r = { data: { ...ra.data, ...rb.data } as CountryGuide };
  return applyFixedRules(country, { ...r.data, v: GUIDE_VERSION } as CountryGuide);
}

/** Guias dos países da viagem (fora o Brasil), do cache ou gerados na hora em paralelo. Nunca lança erro. */
export async function countryGuides(supabase: SupabaseClient, countries: (string | null | undefined)[], opts: { generateMissing?: boolean } = {}): Promise<{ country: string; guide: CountryGuide }[]> {
  const list = [...new Map(countries.filter((c): c is string => !!c && !isBrazil(c)).map((c) => [normCountry(c), c])).entries()];
  if (!list.length) return [];
  const { data: rows } = await supabase.from("country_guides").select("country, display_name, data, updated_at").in("country", list.map(([k]) => k));
  const byKey = new Map((rows ?? []).map((r) => [r.country, r]));
  const fresh = (d: string) => Date.now() - new Date(d).getTime() < MAX_AGE_DAYS * 86400000;
  const out = await Promise.all(list.map(async ([key, name]) => {
    const row = byKey.get(key);
    if (row && fresh(row.updated_at) && (row.data as { v?: number }).v === GUIDE_VERSION) return { country: row.display_name, guide: applyFixedRules(name, row.data as CountryGuide) };
    if (opts.generateMissing === false) return row ? { country: row.display_name, guide: row.data as CountryGuide } : null;
    try {
      const g = await generate(name);
      await supabaseAnon().rpc("server_upsert_country_guide", { p_secret: process.env.INTERNAL_SECRET, p_country: key, p_display: g.country_name || name, p_data: g });
      return { country: g.country_name || name, guide: g };
    } catch (e) {
      console.error("country-guide", name, (e as Error).message);
      return row ? { country: row.display_name, guide: applyFixedRules(name, row.data as CountryGuide) } : null;
    }
  }));
  return out.filter(Boolean) as { country: string; guide: CountryGuide }[];
}

export type Affiliates = { seguro?: { url?: string; label?: string }; esim?: { url?: string; label?: string } };
