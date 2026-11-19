import { type Issue, term } from "@darthsaul/outerworld-ai-core";
import { useQueryClient } from "@tanstack/react-query";

const button =
  "cursor-pointer self-start border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase hover:border-cyan";

/**
 * station.json is on disk but does not load: a field from a newer build, or a hand edit gone
 * wrong. This is still the Commander's station, so setup is never offered (it would replace the
 * file). It says what is wrong and waits for the file to be fixed.
 */
export function StationBrokenPage({ issues }: { readonly issues: readonly Issue[] }) {
  const client = useQueryClient();
  const problems = issues.filter((i) => i.level === "error" && i.path.startsWith("station.json"));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 bg-bg p-4 text-fg">
      <h1 className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2">
        {term("stationBroken.title")}
      </h1>
      <p className="m-0 text-b19 text-fg-soft">{term("stationBroken.body")}</p>
      <ul
        data-station-issues
        className="m-0 flex list-none flex-col gap-1 border-2 border-line bg-well p-3 text-b17"
      >
        {problems.map((i) => (
          <li key={`${i.path}\n${i.message}`}>
            <code className="font-body text-amber">{i.path}</code>: {i.message}
          </li>
        ))}
      </ul>
      <p className="m-0 text-b17 text-fg-mute">{term("stationBroken.safe")}</p>
      <button
        type="button"
        className={button}
        onClick={() => void client.invalidateQueries({ queryKey: ["station"] })}
      >
        {term("stationBroken.retry")}
      </button>
    </main>
  );
}
