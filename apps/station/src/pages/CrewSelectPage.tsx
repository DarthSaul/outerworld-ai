import { CHARACTER_COUNT, CHARACTERS, term, termWith } from "@darthsaul/outerworld-ai-core";
import { CrewSelect, type CrewSelectAgent, roomColorVar, stVar } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { useSetLook } from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";

/**
 * Crew Select (ADR-0013): pick how each crew member appears. Assigning writes `look` to the
 * crew member's agent.json; the change comes back as `agent.updated` like any other edit.
 */
export function CrewSelectPage({ random = Math.random }: { readonly random?: () => number }) {
  const { dashboard, error } = useDashboard();
  const setLook = useSetLook();
  const [configuring, setConfiguring] = useState<string>();
  const [cursor, setCursor] = useState<number>();
  const [assigned, setAssigned] = useState<string>();
  if (!dashboard) return <ErrorNote error={error} />;

  const ordered = [
    ...(dashboard.overseer ? [dashboard.overseer] : []),
    ...dashboard.crew.filter((c) => !c.overseer),
  ];
  const agents: CrewSelectAgent[] = ordered.map((c) => {
    const room = dashboard.rooms.find((r) => r.id === c.roomId);
    return {
      id: c.id,
      name: c.name,
      role: term(c.overseer ? "overseer.role" : "agent"),
      roomName: room?.name ?? c.roomId,
      color: c.overseer
        ? stVar("white")
        : room?.bridge
          ? stVar("cyan")
          : roomColorVar(c.colorIndex),
      look: c.look,
    };
  });
  const active = agents.find((a) => a.id === configuring) ?? agents[0];
  if (!active) return null;
  const at = cursor ?? active.look;

  return (
    <>
      <h1 className="sr-only">{term("tab.crewSelect")}</h1>
      <ErrorNote error={setLook.error} />
      {assigned ? (
        <p role="status" className="m-0 px-3.5 pt-3.5 text-b17 text-green">
          {assigned}
        </p>
      ) : null}
      <CrewSelect
        agents={agents}
        configuring={active.id}
        cursor={at}
        onConfigure={(id) => {
          setConfiguring(id);
          setCursor(agents.find((a) => a.id === id)?.look);
        }}
        onCursor={setCursor}
        onAssign={() =>
          setLook.mutate(
            { agentId: active.id, look: at },
            {
              onSuccess: () =>
                setAssigned(
                  termWith("crewSelect.assigned", {
                    agent: active.name,
                    character: CHARACTERS[at]?.name ?? "",
                  }),
                ),
            },
          )
        }
        onRandom={() => setCursor(Math.floor(random() * CHARACTER_COUNT))}
        busy={setLook.isPending}
      />
    </>
  );
}
