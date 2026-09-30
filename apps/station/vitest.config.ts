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
  },
});
