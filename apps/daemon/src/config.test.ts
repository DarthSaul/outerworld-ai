import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

const base = { homedir: "/Users/c", defaultSpaDir: "/repo/apps/station/dist" };

describe("resolveConfig", () => {
  it("defaults to ~/.outerworld on port 4317, bound to 127.0.0.1, serving the built SPA", () => {
    expect(resolveConfig({}, base)).toEqual({
      home: "/Users/c/.outerworld",
      port: 4317,
      host: "127.0.0.1",
      modelMode: "openrouter",
      spaDir: "/repo/apps/station/dist",
    });
  });

  it("reads OUTERWORLD_HOME (expanding ~), OUTERWORLD_PORT, and the dev origin", () => {
    expect(
      resolveConfig(
        {
          OUTERWORLD_HOME: "~/stations/demo",
          OUTERWORLD_PORT: "5000",
          OUTERWORLD_DEV_ORIGIN: "http://localhost:5173",
          OUTERWORLD_MODEL: "fake",
        },
        base,
      ),
    ).toEqual({
      home: "/Users/c/stations/demo",
      port: 5000,
      host: "127.0.0.1",
      modelMode: "fake",
      devOrigin: "http://localhost:5173",
    });
  });

  it("resolves a relative OUTERWORLD_HOME against the working directory", () => {
    expect(resolveConfig({ OUTERWORLD_HOME: "fixtures/x" }, { ...base, cwd: "/repo" }).home).toBe(
      "/repo/fixtures/x",
    );
  });

  it("rejects a port that is not an integer in range", () => {
    for (const p of ["abc", "70000", "-1", "1.5"]) {
      expect(() => resolveConfig({ OUTERWORLD_PORT: p }, base)).toThrow(/OUTERWORLD_PORT/);
    }
  });

  it("only accepts openrouter or fake as the model mode", () => {
    expect(() => resolveConfig({ OUTERWORLD_MODEL: "gpt" }, base)).toThrow(/OUTERWORLD_MODEL/);
  });

  it("only accepts a loopback http dev origin", () => {
    expect(() => resolveConfig({ OUTERWORLD_DEV_ORIGIN: "https://evil.example" }, base)).toThrow(
      /OUTERWORLD_DEV_ORIGIN/,
    );
  });
});
