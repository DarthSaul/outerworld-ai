import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // CONSTRAINTS.md: no network in tests.
    setupFiles: ["../../packages/runtime/src/test/no-network.ts"],
  },
});
