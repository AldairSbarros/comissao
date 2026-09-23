import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/financeiro",
  async rewrites() {
    // Proxy da API: /financeiro/api/* -> backend:8000/*
    // Dentro do Docker, "backend" é o nome do serviço no compose.
    // Fora do Docker (dev local), defina BACKEND_INTERNAL_URL, ex.: http://localhost:8001
    const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;