import { within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** The menu button named by its label ("Model", "Key", …): its name is the label, then the value. */
export const menu = (scope: HTMLElement, label: string) =>
  within(scope).getByRole("button", { name: new RegExp(`^${label} `) });

/** Opens the menu labelled `label` in `scope` and chooses the option named `option`. */
export async function choose(
  user: UserEvent,
  scope: HTMLElement,
  label: string,
  option: string | RegExp,
): Promise<void> {
  await user.click(menu(scope, label));
  await user.click(await within(scope).findByRole("option", { name: option }));
}
