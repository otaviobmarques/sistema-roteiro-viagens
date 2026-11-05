import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rotta 365 · Roteiros de viagem",
    short_name: "Rotta 365",
    description: "Roteiros verificados, gastos do grupo e modo viagem.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F5F7FB",
    theme_color: "#205BFF",
    lang: "pt-BR",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/symbol.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
