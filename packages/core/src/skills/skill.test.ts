import { describe, expect, it } from "vitest";
import { isRequirement, parseSkillFile } from "./skill.js";

const file = (frontmatter: string, body = "Do the thing well.") =>
  `---\n${frontmatter}\n---\n\n${body}\n`;

const valid = file(
  [
    "name: Field Notes",
    "slug: field-notes",
    "description: Turn a day's observations into tidy notes.",
    "category: Writing",
    "requires: [files, memory]",
    "license: MIT",
    "default: true",
  ].join("\n"),
  "## Method\n1. Gather.\n2. Write.",
);

describe("parseSkillFile", () => {
  it("parses frontmatter and body into a skill keyed by slug", () => {
    const { skill, issues } = parseSkillFile("field-notes.md", valid);
    expect(issues).toEqual([]);
    expect(skill).toEqual({
      id: "field-notes",
      name: "Field Notes",
      description: "Turn a day's observations into tidy notes.",
      category: "Writing",
      requires: ["files", "memory"],
      default: true,
      body: "## Method\n1. Gather.\n2. Write.",
    });
  });

  it("defaults requires to none and default to off; accepts CRLF, a BOM, and quoted values", () => {
    const bom = String.fromCharCode(0xfeff);
    const text = `${bom}${file("name: \"Quiet: One\"\nslug: quiet\ndescription: 'Short.'\ncategory: Misc\nrequires: []")}`;
    const { skill, issues } = parseSkillFile("quiet.md", text.replace(/\n/g, "\r\n"));
    expect(issues).toEqual([]);
    expect(skill).toMatchObject({
      name: "Quiet: One",
      description: "Short.",
      requires: [],
      default: false,
    });
  });

  it("skips comments and blank lines in frontmatter", () => {
    const text = file("# a note\n\nname: A\nslug: a\ndescription: d\ncategory: c");
    expect(parseSkillFile("a.md", text).skill?.id).toBe("a");
  });

  it.each([
    ["no frontmatter", "Just a body.", /no frontmatter/],
    ["a non key-value line", file("name: A\njust words\nslug: a"), /line 3 is not "key: value"/],
    ["a repeated key", file("name: A\nname: B"), /"name" appears twice/],
    ["an unclosed list", file("name: A\nrequires: [web, files"), /opens a list/],
    ["a missing field", file("name: A\nslug: a\ncategory: c"), /description/],
    ["a bad slug", file("name: A\nslug: Not OK\ndescription: d\ncategory: c"), /slug/],
    [
      "a non-boolean default",
      file("name: A\nslug: a\ndescription: d\ncategory: c\ndefault: yes"),
      /default/,
    ],
  ])("rejects a file with %s, never throwing", (_label, text, message) => {
    const { skill, issues } = parseSkillFile("a.md", text);
    expect(skill).toBeUndefined();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ level: "error", path: "a.md" });
    expect(issues.map((i) => i.message).join(" ")).toMatch(message);
  });

  it("rejects a slug that does not match the file name", () => {
    const { skill, issues } = parseSkillFile("other.md", valid);
    expect(skill).toBeUndefined();
    expect(issues[0]?.message).toMatch(/does not match the file name "other"/);
  });

  it("rejects a skill with no body", () => {
    const text = "---\nname: A\nslug: a\ndescription: d\ncategory: c\n---\n";
    expect(parseSkillFile("a.md", text).issues[0]?.message).toMatch(/no body/);
  });

  it("keeps an unknown requirement, with a warning that it is never met", () => {
    const text = file("name: A\nslug: a\ndescription: d\ncategory: c\nrequires: [web, telepathy]");
    const { skill, issues } = parseSkillFile("a.md", text);
    expect(skill?.requires).toEqual(["web", "telepathy"]);
    expect(issues).toEqual([
      {
        level: "warn",
        path: "a.md",
        message: expect.stringMatching(/unknown requirement "telepathy"/),
      },
    ]);
  });
});

describe("isRequirement", () => {
  it("knows the capability names and nothing else", () => {
    expect(isRequirement("shell")).toBe(true);
    expect(isRequirement("dish")).toBe(false);
  });
});
