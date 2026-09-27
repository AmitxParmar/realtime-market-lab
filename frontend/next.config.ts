import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Web Workers are loaded via `new URL(..., import.meta.url)` + `new Worker()`,
  // which Turbopack/webpack both handle natively in Next 16 - no extra config needed.
  experimental: {
    optimizePackageImports: ["@tanstack/react-virtual"],
  },
};

export default nextConfig;
