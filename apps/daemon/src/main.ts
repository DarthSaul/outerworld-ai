import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./config.js";
import { startDaemon } from "./daemon.js";

/** Process entry: `node apps/daemon/dist/main.js`. Everything else is in startDaemon. */
const builtSpa = fileURLToPath(new URL("../../station/dist", import.meta.url));
const config = resolveConfig(process.env, {
  homedir: homedir(),
  ...(existsSync(builtSpa) ? { defaultSpaDir: builtSpa } : {}),
});
const daemon = await startDaemon(config);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    daemon.close("signal").then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
  });
}
