// Regra única contra duplicação na viagem: o mesmo lugar não entra duas vezes,
// nem quando a IA escreve o nome de outro jeito ("Palácio da Pena em Sintra" = "Palácio da Pena").

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "as", "os", "the", "of", "in", "at", "y", "del", "la", "el", "di", "le", "visita", "passeio", "tour", "ao", "aos", "com"]);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string, ignore: Set<string>): string[] {
  return normalizeName(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t) && !ignore.has(t));
}

/** Dois nomes são o mesmo lugar se forem iguais ou se um contém todas as palavras relevantes do outro (mínimo 2). */
export function sameName(a: string, b: string, ignore: Set<string> = new Set()): boolean {
  const ta = tokens(a, ignore), tb = tokens(b, ignore);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [small, big] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return small.length >= 2 && small.every((t) => big.has(t));
}

type Visit = { place_id?: string | null; title: string; kind?: string | null };

/** Itens que não contam como "visita" (podem repetir): trajetos, notas, tempo livre e hospedagem. */
const REPEATABLE = new Set(["trajeto", "nota", "livre", "hospedagem"]);

export class TripPlaces {
  private ids = new Set<string>();
  private names: string[] = [];
  private ignore: Set<string>;

  /** cities: nomes das cidades da viagem, ignorados na comparação ("... em Sintra"). */
  constructor(cities: string[] = []) {
    this.ignore = new Set(cities.flatMap((c) => normalizeName(c).split(" ")));
  }

  static from(items: Visit[], cities: string[] = []) {
    const t = new TripPlaces(cities);
    items.forEach((i) => t.add(i));
    return t;
  }

  has(i: Visit): boolean {
    if (REPEATABLE.has(i.kind ?? "")) return false;
    if (i.place_id && this.ids.has(i.place_id)) return true;
    return this.names.some((n) => sameName(n, i.title, this.ignore));
  }

  add(i: Visit) {
    if (REPEATABLE.has(i.kind ?? "")) return;
    if (i.place_id) this.ids.add(i.place_id);
    this.names.push(i.title);
  }

  /** Adiciona se for novo; devolve false se já existir (e não adiciona). */
  tryAdd(i: Visit): boolean {
    if (this.has(i)) return false;
    this.add(i);
    return true;
  }
}
