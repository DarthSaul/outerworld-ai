import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/bin.ts", "src/test/**"],
      // CONSTRAINTS.md: generator lines >= 90, branches >= 85.
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
