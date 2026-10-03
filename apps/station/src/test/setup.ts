import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers.js";

expect.extend(axeMatchers);

// The station shell renders the whole dashboard chrome (header stats, radio, vitals) on every
// screen. On a 2-core CI runner with coverage on, a click-to-render step can take over a second,
// past Testing Library's 1 s default, though it takes ~300 ms locally. Waits still fail when the
// element never appears; they just allow for a slower machine.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
