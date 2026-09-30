import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    // CONSTRAINTS.md: no network in tests.
    setupFiles: ["../../packages/runtime/src/test/no-network.ts", "src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/dev/**"],
      // CONSTRAINTS.md: lines >= 85, branches >= 80.
      thresholds: { lines: 85, branches: 80 },
    },
  },
});
