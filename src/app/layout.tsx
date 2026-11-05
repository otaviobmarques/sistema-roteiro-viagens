import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Rotta 365 · Roteiros de viagem", template: "%s · Rotta 365" },
  description: "Diga os destinos e o Pino monta o roteiro com lugares verificados, divide os gastos do grupo e acompanha você na viagem.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Rotta 365", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#205BFF", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${jakarta.variable} ${manrope.variable} ${jetbrains.variable} min-h-dvh antialiased`}>{children}</body>
    </html>
  );
}
