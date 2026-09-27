import { Badge } from "@darthsaul/outerworld-ai-ui";

/** Component gallery. Grows with the ui step: every component in both themes and every rig state. */
export default function DevPage() {
  return (
    <main className="mx-auto flex max-w-(--ow-measure) flex-col gap-ow-6 p-ow-6">
      <h1 className="text-title text-ink-1">Component gallery</h1>
      <section className="flex flex-col gap-ow-2">
        <h2 className="font-mono text-eyebrow uppercase text-ink-3">Badge</h2>
        <div className="flex gap-(--ow-size-chip-gap)">
          <Badge mode="read">notion</Badge>
          <Badge mode="write">ledger</Badge>
        </div>
      </section>
    </main>
  );
}
