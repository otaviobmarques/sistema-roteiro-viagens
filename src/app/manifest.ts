import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Rotta 365 · Roteiros de viagem",
    short_name: "Rotta 365",
    description: "Diga os destinos e o Pino monta o roteiro com lugares verificados, divide os gastos do grupo no Pix e acompanha você na viagem.",
    start_url: "/app?origem=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#F5F7FB",
    theme_color: "#205BFF",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["travel", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nova viagem com o Pino", short_name: "Nova viagem", url: "/app/nova", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Me surpreenda", short_name: "Surpreenda", url: "/app/surpreenda", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Carteira", short_name: "Carteira", url: "/app/carteira", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    screenshots: [
      { src: "/screenshots/desktop.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "Rotta 365 no computador" },
      { src: "/screenshots/mobile.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "Rotta 365 no celular" },
    ],
  };
}
