import { SCHEMA_VERSION } from "@darthsaul/outerworld-ai-core";
import { Badge } from "@darthsaul/outerworld-ai-ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-(--ow-measure) flex-col gap-ow-4 p-ow-6">
      <p className="font-mono text-eyebrow uppercase text-ink-3">
        Outerworld AI · schema v{SCHEMA_VERSION}
      </p>
      <h1 className="text-display text-ink-1">Scaffold</h1>
      <p className="text-body text-ink-2">
        The map lands in the ui step. This page proves the token pipeline end to end.
      </p>
      <div className="flex gap-(--ow-size-chip-gap)">
        <Badge mode="read">notion</Badge>
        <Badge mode="write">ledger</Badge>
      </div>
    </main>
  );
}
