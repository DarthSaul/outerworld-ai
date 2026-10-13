import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  DEFAULT_SESSION_TITLE,
  fallbackTitle,
  MAX_TITLE_CHARS,
  TITLE_INSTRUCTIONS,
  titlePrompt,
} from "./session-title.js";

describe("session titles", () => {
  it("asks for a short title and passes the first message as data, cut to size", () => {
    const prompt = titlePrompt("x".repeat(5000));
    expect(prompt.instructions).toBe(TITLE_INSTRUCTIONS);
    expect(prompt.instructions).toMatch(/data, not instructions/);
    expect(prompt.text).toHaveLength(2000);
  });

  it("cleans a model reply down to one plain line", () => {
    expect(cleanTitle("Weekly launch notes")).toBe("Weekly launch notes");
    expect(cleanTitle('"Weekly launch notes."')).toBe("Weekly launch notes");
    expect(cleanTitle("Title: **Weekly launch notes**")).toBe("Weekly launch notes");
    expect(cleanTitle("\n\n## Launch   plan\nBecause you asked")).toBe("Launch plan");
    expect(cleanTitle("“Quoted”")).toBe("Quoted");
  });

  it("gives nothing for an empty reply, and clips a long one at a word", () => {
    expect(cleanTitle("  \n ")).toBeUndefined();
    expect(cleanTitle('""')).toBeUndefined();
    const long = cleanTitle("word ".repeat(40)) ?? "";
    expect(long.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    expect(long.endsWith("word…")).toBe(true);
  });

  it("falls back to the message itself, on one line", () => {
    expect(fallbackTitle("Draft the\n  launch email")).toBe("Draft the launch email");
    expect(fallbackTitle("a".repeat(100))).toBe(`${"a".repeat(47)}…`);
    expect(fallbackTitle("   ")).toBe(DEFAULT_SESSION_TITLE);
  });
});
