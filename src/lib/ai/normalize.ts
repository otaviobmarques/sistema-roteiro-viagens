// A IA às vezes escreve variações ("refeição", "Passeio", "Clássica"). Normalizamos no código em vez de rejeitar a resposta.
const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export type ItemKind = "lugar" | "atividade" | "refeicao" | "hospedagem" | "nota" | "livre" | "trajeto";

export function normalizeKind(raw: string | null | undefined): ItemKind {
  const k = strip(raw ?? "");
  if (/refei|almoc|jantar|cafe da manha|lanche|restaurante|meal|food/.test(k)) return "refeicao";
  if (/hosped|hotel|hostel|pousada|check.?in|lodging/.test(k)) return "hospedagem";
  if (/trajet|transpor|desloc|trem|onibus|voo|transfer/.test(k)) return "trajeto";
  if (/livre|descanso|free/.test(k)) return "livre";
  if (/nota|dica|obs/.test(k)) return "nota";
  if (/ativid|experien|passeio|tour|aula/.test(k)) return "atividade";
  return "lugar";
}

export function normalizeProfile(raw: string | null | undefined): "mochilao" | "classica" | "experiencia" {
  const p = strip(raw ?? "");
  if (p.startsWith("mochil") || p.includes("econom") || p.includes("backpack")) return "mochilao";
  if (p.startsWith("experi") || p.includes("premium") || p.includes("luxo")) return "experiencia";
  return "classica";
}
