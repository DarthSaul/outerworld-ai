import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/no-network.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // CONSTRAINTS.md: runtime lines >= 85, branches >= 80.
      thresholds: { lines: 85, branches: 80 },
    },
  },
});
