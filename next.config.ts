import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Production: standalone output for Docker deployment (Railway, etc.)
  output: "standalone",
  // Bypass tw-animate-css restrictive exports map (Turbopack can't resolve "style" condition)
  turbopack: {
    resolveAlias: {
      'tw-animate-css': './node_modules/tw-animate-css/dist/tw-animate.css',
    },
  },
  // Allow cross-origin requests from Z.ai preview gateway (dev only, harmless in prod)
  ...(process.env.NODE_ENV === 'development' ? { allowedDevOrigins: ["*"] as const } : {}),
  // Allow embedding in iframes (Z.ai preview panel, etc.)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "ALLOWALL",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
