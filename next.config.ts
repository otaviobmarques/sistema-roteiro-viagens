import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // fontes e imagens lidas do disco pelo gerador de banners (opengraph-image)
  outputFileTracingIncludes: {
    "/v/[slug]/opengraph-image": ["./src/assets/fonts/**", "./public/brand/logo.png", "./public/brand/pino.png"],
  },
};

export default nextConfig;
