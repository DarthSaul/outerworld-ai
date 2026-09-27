import { describe, expect, it } from "vitest";
import { isSupportedSchemaVersion, SCHEMA_VERSION } from "./index.js";

describe("schema version", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it("accepts only the current version", () => {
    expect(isSupportedSchemaVersion(SCHEMA_VERSION)).toBe(true);
    expect(isSupportedSchemaVersion(SCHEMA_VERSION + 1)).toBe(false);
    expect(isSupportedSchemaVersion("1")).toBe(false);
    expect(isSupportedSchemaVersion(undefined)).toBe(false);
  });
});
