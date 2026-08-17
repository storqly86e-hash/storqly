import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Production: standalone output for Docker deployment (Railway, etc.)
  output: "standalone",
  // Allow cross-origin requests from Z.ai preview gateway (dev only, harmless in prod)
  ...(process.env.NODE_ENV === 'development' ? { allowedDevOrigins: ["*"] as const } : {}),
  // Prevent CDN from caching stale HTML (1 year default breaks redeployments)
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
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
// v4.1
