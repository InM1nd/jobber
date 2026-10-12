import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  cacheComponents: true,
  serverExternalPackages: ['unpdf', '@prisma/client'],
  partialPrefetching: true,
  experimental: {
    // Keep visited tabs in the client cache so switching back is instant.
    staleTimes: { dynamic: 60, static: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
