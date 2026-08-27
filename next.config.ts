import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    authInterrupts: true,
    typedEnv: true,
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
