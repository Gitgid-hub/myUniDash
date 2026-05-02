import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev && config.output && typeof config.output === "object") {
      // Avoid ChunkLoadError (timeout) on first paint when large client chunks are still compiling.
      // See https://github.com/vercel/next.js/issues/66526
      config.output.chunkLoadTimeout = 300_000;
    }
    return config;
  }
};

export default nextConfig;
