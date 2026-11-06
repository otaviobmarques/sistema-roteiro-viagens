export type LatLng = { lat: number; lng: number };
export type TransportMode = "a_pe" | "transporte" | "carro" | "bicicleta" | "taxi" | "trem" | "aviao";

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Velocidade média (km/h), fator de desvio da rota real e tempo fixo (espera, estacionar, embarque).
const MODES: Record<TransportMode, { kmh: number; detour: number; fixed: number; label: string }> = {
  a_pe: { kmh: 4.5, detour: 1.3, fixed: 0, label: "a pé" },
  bicicleta: { kmh: 13, detour: 1.3, fixed: 3, label: "bicicleta" },
  transporte: { kmh: 18, detour: 1.4, fixed: 8, label: "transporte público" },
  taxi: { kmh: 24, detour: 1.35, fixed: 5, label: "táxi/app" },
  carro: { kmh: 30, detour: 1.35, fixed: 8, label: "carro" },
  trem: { kmh: 90, detour: 1.2, fixed: 20, label: "trem" },
  aviao: { kmh: 650, detour: 1.05, fixed: 150, label: "avião" },
};

export function modeLabel(m: string | null | undefined): string {
  return MODES[(m as TransportMode) ?? "a_pe"]?.label ?? "a pé";
}

/** Estimativa de deslocamento em minutos. Substituível por OSRM/Valhalla (seção 12). */
export function travelMinutes(a: LatLng | null, b: LatLng | null, mode: TransportMode = "a_pe"): number {
  if (!a || !b || a.lat == null || b.lat == null) return 15;
  const km = haversineKm(a, b);
  if (km < 0.05) return 0;
  const cfg = MODES[mode] ?? MODES.a_pe;
  return Math.max(3, Math.round((km * cfg.detour * 60) / cfg.kmh + cfg.fixed));
}

/** Escolhe um modo razoável pela distância quando o usuário não definiu (a pé até ~1,8 km). */
export function suggestMode(a: LatLng | null, b: LatLng | null, profile = "classica"): TransportMode {
  if (!a || !b) return "a_pe";
  const km = haversineKm(a, b);
  if (km <= 1.8) return "a_pe";
  if (km > 150) return "trem";
  if (profile === "experiencia") return "taxi";
  return "transporte";
}

/** Link do Google Maps com a rota entre dois pontos no modo certo (horários reais do transporte público). */
export function mapsRouteUrl(a: LatLng, b: LatLng, mode: string | null | undefined) {
  const travelmode = mode === "a_pe" ? "walking" : mode === "transporte" || mode === "trem" ? "transit" : mode === "bicicleta" ? "bicycling" : "driving";
  return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${travelmode}`;
}
