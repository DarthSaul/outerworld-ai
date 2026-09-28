import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The root CLAUDE.md is the agent guide; do not let Next generate a second one in this folder.
  agentRules: false,
  // Workspace packages ship ESM from dist/; ui's CSS entry is consumed from src/.
  transpilePackages: ["@darthsaul/outerworld-ai-ui", "@darthsaul/outerworld-ai-core"],
};

export default nextConfig;
