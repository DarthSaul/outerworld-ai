/** Shown when the page was not served by the daemon (or the dev server), so it has no token. */
export function MissingToken() {
  return (
    <main className="mx-auto flex max-w-(--ow-measure) flex-col gap-(--ow-space-3) p-(--ow-space-6)">
      <h1 className="text-title text-ink-1">Open Outerworld AI from its daemon</h1>
      <p className="text-body text-ink-2">
        This page needs the access token the daemon puts into the page it serves. Start it with{" "}
        <code className="font-mono text-mono">pnpm dev</code> or{" "}
        <code className="font-mono text-mono">node apps/daemon/dist/main.js</code> and open the
        address it prints.
      </p>
    </main>
  );
}
