import type { Trip } from "./types";

export function tripPeriod(t: Pick<Trip, "start_date" | "end_date">) {
  if (!t.start_date) return "datas a definir";
  const f = (s: string) => s.split("-").reverse().slice(0, 2).join("/");
  return t.end_date ? `${f(t.start_date)} → ${f(t.end_date)}` : f(t.start_date);
}

export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", planejando: "Planejando", confirmada: "Confirmada", em_andamento: "Em andamento", concluida: "Concluída", arquivada: "Arquivada",
};

export const PROFILE_LABEL: Record<string, string> = { mochilao: "Mochilão", classica: "Clássica", experiencia: "Experiência" };
