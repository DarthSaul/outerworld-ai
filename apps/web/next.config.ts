import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship ESM from dist/; ui's CSS entry is consumed from src/.
  transpilePackages: ["@darthsaul/outerworld-ai-ui", "@darthsaul/outerworld-ai-core"],
};

export default nextConfig;
