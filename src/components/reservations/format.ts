import { Plane, Hotel, Home, TrainFront, Bus, Car, Ship, Ticket, UtensilsCrossed, MapPinned, ShieldCheck, Package } from "lucide-react";

export const RES_KINDS: { id: string; label: string; icon: typeof Plane }[] = [
  { id: "voo", label: "Voo", icon: Plane },
  { id: "hotel", label: "Hotel", icon: Hotel },
  { id: "aluguel", label: "Aluguel por temporada", icon: Home },
  { id: "trem", label: "Trem", icon: TrainFront },
  { id: "onibus", label: "Ônibus", icon: Bus },
  { id: "carro", label: "Carro", icon: Car },
  { id: "barco", label: "Barco", icon: Ship },
  { id: "ingresso", label: "Ingresso", icon: Ticket },
  { id: "restaurante", label: "Restaurante", icon: UtensilsCrossed },
  { id: "passeio", label: "Passeio", icon: MapPinned },
  { id: "seguro", label: "Seguro", icon: ShieldCheck },
  { id: "outro", label: "Outro", icon: Package },
];
export const kindLabel = (k: string) => RES_KINDS.find((x) => x.id === k)?.label ?? k;

/** As datas das reservas são guardadas como hora local do evento ("parede"), lidas sempre em UTC. */
export function fmtLocal(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
export function toInput(iso: string | null | undefined) {
  if (!iso) return "";
  return iso.slice(0, 16);
}
export function toDb(local: string) {
  return local ? `${local.length === 10 ? `${local}T00:00` : local}:00Z` : null;
}

