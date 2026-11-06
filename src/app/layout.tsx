import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "600"] });

const DESCRIPTION = "Diga os destinos e o Pino monta o roteiro com lugares reais e verificados, divide os gastos do grupo no Pix e acompanha você na viagem.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://rotta365.vercel.app"),
  title: { default: "Rotta 365 · Roteiros de viagem", template: "%s · Rotta 365" },
  description: DESCRIPTION,
  applicationName: "Rotta 365",
  keywords: ["roteiro de viagem", "planejar viagem", "itinerário", "viagem em grupo", "dividir gastos", "Pix", "inteligência artificial", "Rotta 365"],
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Rotta 365", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Rotta 365",
    title: "Rotta 365 · Diga os países. O Pino monta a viagem.",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Rotta 365 · Diga os países. O Pino monta a viagem." }],
  },
  twitter: { card: "summary_large_image", title: "Rotta 365 · Diga os países. O Pino monta a viagem.", description: DESCRIPTION, images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#205BFF", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${jakarta.variable} ${manrope.variable} ${jetbrains.variable} min-h-dvh antialiased`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
