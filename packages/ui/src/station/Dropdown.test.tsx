import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { Dropdown } from "./Dropdown.js";

const groups = [
  {
    id: "command",
    label: "Command",
    options: [{ value: "vesper", label: <b>Vesper</b>, text: "Vesper · Idle" }],
  },
  { id: "empty", label: "Empty", options: [] },
  {
    id: "ops",
    label: "Operations",
    options: [
      { value: "quill", label: <b>Quill</b>, text: "Quill · Active" },
      { value: "quartz", label: <b>Quartz</b>, text: "Quartz · Idle" },
    ],
  },
];

function Harness({ onChange = () => {} }: { readonly onChange?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <span id="crew-label">Crew · 3</span>
      <Dropdown
        labelledBy="crew-label"
        value={value}
        placeholder="Pick a crew member"
        groups={groups}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <button type="button">Elsewhere</button>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: /^Crew · 3/ });

describe("Dropdown", () => {
  it("is a labelled button showing the placeholder, with its list closed", async () => {
    const { container } = render(<Harness />);
    expect(trigger()).toHaveAccessibleName("Crew · 3 Pick a crew member");
    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens on click with options named with their group, and chooses one", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    const list = screen.getByRole("listbox", { name: "Crew · 3" });
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual([
      "Vesper · Idle, Command",
      "Quill · Active, Operations",
      "Quartz · Idle, Operations",
    ]);
    expect(list).toHaveTextContent("Operations");
    expect(list).not.toHaveTextContent("Empty");
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("option", { name: /^Quill/ }));
    expect(onChange).toHaveBeenCalledWith("quill");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAccessibleName("Crew · 3 Quill · Active");
  });

  it("works from the keyboard: arrows, Home, End, letters, Enter, and Escape", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /^Vesper/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /^Quill/ })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("option", { name: /^Quartz/ })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("option", { name: /^Vesper/ })).toHaveFocus();
    await userEvent.keyboard("q");
    expect(screen.getByRole("option", { name: /^Quill/ })).toHaveFocus();
    await userEvent.keyboard("q");
    expect(screen.getByRole("option", { name: /^Quartz/ })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("quill");
    // Reopening starts on the chosen option, marked selected.
    await userEvent.keyboard(" ");
    const quill = screen.getByRole("option", { name: /^Quill/ });
    expect(quill).toHaveFocus();
    expect(quill).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Tab and on a click outside", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.click(trigger());
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open with no options", async () => {
    const user = userEvent.setup();
    render(
      <>
        <span id="none-label">Crew · 0</span>
        <Dropdown
          labelledBy="none-label"
          value=""
          placeholder="Pick"
          groups={[]}
          onChange={() => {}}
        />
      </>,
    );
    const button = screen.getByRole("button", { name: /^Crew · 0/ });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("chooses the focused option when the list changes while open", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = (g: typeof groups) => (
      <>
        <span id="crew-label">Crew · 3</span>
        <Dropdown
          labelledBy="crew-label"
          value=""
          placeholder="Pick"
          groups={g}
          onChange={onChange}
        />
      </>
    );
    const { rerender } = render(view(groups));
    trigger().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: /^Quill/ })).toHaveFocus();
    // A crew member joins Command, ahead of Quill in the list.
    const [command, ...rest] = groups;
    if (!command) throw new Error("no group");
    rerender(
      view([
        {
          ...command,
          options: [...command.options, { value: "ash", label: <b>Ash</b>, text: "Ash · Idle" }],
        },
        ...rest,
      ]),
    );
    expect(screen.getByRole("option", { name: /^Quill/ })).toHaveFocus();
    // Arrows move from the focused option, not from a stale index.
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /^Quartz/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: /^Quill/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("quill");
  });

  it("as a chip: sizes to its value, opens above at the end edge, with descriptions and a check", async () => {
    const user = userEvent.setup();
    function Chip() {
      const [value, setValue] = useState("opus");
      return (
        <>
          <span id="model-label">Model</span>
          <Dropdown
            labelledBy="model-label"
            value={value}
            placeholder="Model"
            variant="chip"
            placement="above"
            align="end"
            groups={[
              {
                id: "models",
                label: "",
                options: [
                  {
                    value: "opus",
                    label: "Opus 5.5",
                    text: "Opus 5.5",
                    description: "For complex work",
                  },
                  {
                    value: "sonnet",
                    label: "Sonnet 5.5",
                    text: "Sonnet 5.5",
                    description: "Everyday work",
                  },
                ],
              },
            ]}
            onChange={setValue}
          />
        </>
      );
    }
    const { container } = render(<Chip />);
    const button = screen.getByRole("button", { name: "Model Opus 5.5" });
    expect(button.className).not.toMatch(/w-full/);
    await user.click(button);
    const list = screen.getByRole("listbox", { name: "Model" });
    expect(list.className).toMatch(/bottom-full/);
    expect(list.className).toMatch(/right-0/);
    const opus = screen.getByRole("option", { name: "Opus 5.5, For complex work" });
    expect(opus).toHaveAttribute("aria-selected", "true");
    expect(opus).toHaveTextContent("✓");
    expect(screen.getByText("Everyday work")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("option", { name: "Sonnet 5.5, Everyday work" }));
    expect(screen.getByRole("button", { name: "Model Sonnet 5.5" })).toHaveFocus();
  });
});
