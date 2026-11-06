import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium sem tela para gerar o PDF do relatório no servidor
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // fontes e imagens lidas do disco pelo gerador de banners (opengraph-image)
  outputFileTracingIncludes: {
    "/v/[slug]/opengraph-image": ["./src/assets/fonts/**", "./public/brand/logo.png", "./public/brand/pino.png"],
  },
};

export default nextConfig;
