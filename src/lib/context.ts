// Dados abertos de contexto: clima (Open-Meteo), feriados (BrasilAPI / Nager.Date), câmbio (Frankfurter).
const UA = { "User-Agent": "Rotta365/1.0" };

async function getJSON(url: string, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal, next: { revalidate: 3600 } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export type DayWeather = { date: string; tmax: number | null; tmin: number | null; rain: number | null; code: number | null };

/** Previsão de até 16 dias; datas além disso ficam sem previsão (null). */
export async function weather(lat: number, lng: number, start: string, end: string): Promise<Record<string, DayWeather>> {
  try {
    const d = await getJSON(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&start_date=${start}&end_date=${end}`,
    );
    const out: Record<string, DayWeather> = {};
    (d.daily?.time ?? []).forEach((date: string, i: number) => {
      out[date] = { date, tmax: d.daily.temperature_2m_max[i], tmin: d.daily.temperature_2m_min[i], rain: d.daily.precipitation_probability_max[i], code: d.daily.weather_code[i] };
    });
    return out;
  } catch {
    return {};
  }
}

export function weatherLabel(code: number | null | undefined): string {
  if (code == null) return "";
  if (code === 0) return "céu limpo";
  if (code <= 3) return "parcialmente nublado";
  if (code <= 48) return "neblina";
  if (code <= 67) return "chuva";
  if (code <= 77) return "neve";
  if (code <= 82) return "pancadas de chuva";
  return "tempestade";
}

const COUNTRY_CODES: Record<string, string> = {
  brasil: "BR", portugal: "PT", espanha: "ES", "españa": "ES", italia: "IT", "itália": "IT", franca: "FR", "frança": "FR",
  suica: "CH", "suíça": "CH", argentina: "AR", chile: "CL", uruguai: "UY", "estados unidos": "US", "reino unido": "GB",
  alemanha: "DE", "países baixos": "NL", holanda: "NL", grecia: "GR", "grécia": "GR", mexico: "MX", "méxico": "MX", peru: "PE", colombia: "CO", "colômbia": "CO", japao: "JP", "japão": "JP",
};

export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CODES[country.toLowerCase().trim()] ?? null;
}

/** Feriados nacionais (Brasil via BrasilAPI; demais países via Nager.Date). */
export async function holidays(countryName: string | null | undefined, year: number): Promise<Set<string>> {
  const cc = countryCode(countryName);
  if (!cc) return new Set();
  try {
    if (cc === "BR") {
      const d = await getJSON(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      return new Set(d.map((h: { date: string }) => h.date));
    }
    const d = await getJSON(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`);
    return new Set(d.map((h: { date: string }) => h.date));
  } catch {
    return new Set();
  }
}

export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  PT: "EUR", ES: "EUR", IT: "EUR", FR: "EUR", DE: "EUR", NL: "EUR", GR: "EUR", CH: "CHF", AR: "ARS", CL: "CLP", UY: "UYU", US: "USD", GB: "GBP", MX: "MXN", PE: "PEN", CO: "COP", JP: "JPY", BR: "BRL",
};

/** Cotação para real: PTAX (Banco Central) quando disponível, senão Frankfurter. */
export async function fxToBRL(currency: string, date?: string): Promise<number | null> {
  if (currency === "BRL") return 1;
  try {
    const d = await getJSON(`https://api.frankfurter.dev/v1/${date || "latest"}?base=${currency}&symbols=BRL`);
    return d.rates?.BRL ?? null;
  } catch {
    try {
      const d = await getJSON(`https://economia.awesomeapi.com.br/json/last/${currency}-BRL`);
      const k = `${currency}BRL`;
      return d[k] ? Number(d[k].bid) : null;
    } catch {
      return null;
    }
  }
}
