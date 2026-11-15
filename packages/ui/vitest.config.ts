import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    css: false,
    // As in apps/station: the whole suite runs every package in parallel with coverage, and the
    // heavier component tests (axe over 31 character tiles) pass the 5 s default under that load.
    testTimeout: 20_000,
  },
});
