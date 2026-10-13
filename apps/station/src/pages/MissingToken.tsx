/** Shown when the page was not served by the daemon (or the dev server), so it has no token. */
export function MissingToken() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 bg-bg p-6 text-fg">
      <h1 className="m-0 font-display font-normal text-d14 text-title uppercase tracking-st-2 leading-[1.4]">
        Open Outerworld AI from its daemon
      </h1>
      <p className="m-0 text-b19 text-fg-soft">
        This page needs the access token the daemon puts into the page it serves. Start it with{" "}
        <code className="font-body text-cyan">pnpm dev</code> or{" "}
        <code className="font-body text-cyan">node apps/daemon/dist/main.js</code> and open the
        address it prints.
      </p>
    </main>
  );
}
