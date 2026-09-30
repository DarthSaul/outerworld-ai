import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // CONSTRAINTS.md: no network in tests.
    setupFiles: ["../../packages/runtime/src/test/no-network.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/main.ts"],
      // CONSTRAINTS.md: lines >= 85, branches >= 80.
      thresholds: { lines: 85, branches: 80 },
    },
  },
});
