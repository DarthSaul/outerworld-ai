import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Markdown, plainText } from "./Markdown.js";

describe("Markdown", () => {
  it("draws emphasis, lists, code, and tables instead of their marks", async () => {
    const { container } = render(
      <Markdown
        text={
          "Two **caveats** and *one* note:\n\n- first\n- `second`\n\n| a | b |\n|---|---|\n| 1 | 2 |"
        }
      />,
    );
    expect(container.textContent).not.toContain("**");
    expect(screen.getByText("caveats").tagName).toBe("STRONG");
    expect(screen.getByText("one").tagName).toBe("EM");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("second").tagName).toBe("CODE");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps a message's headings out of the page outline", () => {
    render(<Markdown text={"# Plan\n\nDo it."} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Plan")).toBeInTheDocument();
  });

  it("treats model output as untrusted: no raw HTML, no images, links in a new tab", () => {
    const { container } = render(
      <Markdown
        text={
          "<script>alert(1)</script><b>bold</b>\n\n![pixel](https://tracker.example/p.gif)\n\n[site](https://example.com) [bad](javascript:alert(1))"
        }
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("pixel");
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("bad").closest("a")?.getAttribute("href") ?? "").not.toMatch(
      /^javascript:/,
    );
  });
});

describe("plainText", () => {
  it("strips marks for a one-line preview", () => {
    expect(plainText("## Plan\n\nTwo **caveats** and `code`, see [docs](https://x).\n- item")).toBe(
      "Plan Two caveats and code, see docs. item",
    );
  });

  it("cuts a very long unbroken run, such as a pasted URL, so a preview keeps its line", () => {
    const url = `https://example.com/${"a".repeat(200)}`;
    const out = plainText(`See ${url} now`);
    expect(out.startsWith("See https://example.com/")).toBe(true);
    expect(out.endsWith("… now")).toBe(true);
    expect(Math.max(...out.split(" ").map((w) => w.length))).toBe(48);
  });

  it("keeps underscores inside names like write_file, dropping only emphasis marks", () => {
    expect(plainText("Quill wants to use write_file on _notes.md_.")).toBe(
      "Quill wants to use write_file on notes.md.",
    );
    expect(plainText("__bold__ and snake_case_name")).toBe("bold and snake_case_name");
  });
});
