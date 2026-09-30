/**
 * Registers vitest-axe's matcher types with Vitest 5. Kept as a .ts module (not .d.ts) so
 * skipLibCheck cannot hide a broken augmentation. The type parameters mirror Vitest's own
 * Matchers<R, T> declaration; TypeScript requires them to match for the merge.
 */
import type { AxeMatchers } from "vitest-axe";

declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): ReturnType<AxeMatchers["toHaveNoViolations"]>;
  }
}
