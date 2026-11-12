import { type Dashboard, type ModelSettings, term } from "@darthsaul/outerworld-ai-core";
import { OutlineButton, OverseerCommsBody } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { ModelPicker } from "../components/ModelPicker.js";
import { useSessions, useStationView } from "../queries.js";
import type { Comms } from "../station/use-comms.js";
import { ChatWindow } from "./ChatWindow.js";

const KEY = "outerworld.overseerOrder";

function readOpen(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeOpen(sessionId: string | undefined): void {
  try {
    if (sessionId) localStorage.setItem(KEY, sessionId);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked (private windows); the conversation stays open until the tab closes.
  }
}

/**
 * The Station's Overseer comms tab. With no order open: approvals and chatter, and the order box
 * with the next order's model settings beneath it. Each order starts a new session, which then
 * fills the tab as a chat (streaming in place, follow-ups going to the same session) until the
 * Commander chooses "Give a new order". The open order is kept per browser, but only while its
 * session still exists and is not archived.
 */
export function OverseerPanel({
  dashboard,
  comms,
  onOrdered,
  paused = false,
}: {
  readonly dashboard: Dashboard;
  readonly comms: Comms;
  /** Not on screen (another tab is shown): hold the message rather than move on unseen. */
  readonly paused?: boolean;
  /** An order went out (the Station points the scanner at the bridge). */
  readonly onOrdered?: () => void;
}) {
  const overseer = dashboard.overseer;
  const sessions = useSessions(overseer?.id);
  const station = useStationView();
  const overseerModel = station.data?.agents.find((a) => a.id === overseer?.id)?.config.model ?? "";
  const [open, setOpenState] = useState(readOpen);
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  // A session started here is trusted before the session list has been refetched to include it.
  const [started, setStarted] = useState<string>();
  const setOpen = (sessionId: string | undefined) => {
    setOpenState(sessionId);
    storeOpen(sessionId);
  };
  const live =
    open !== undefined &&
    (open === started ||
      sessions.data === undefined ||
      sessions.data.some((s) => s.id === open && !s.archivedAt));

  if (open && live) {
    return (
      <ChatWindow
        sessionId={open}
        fill
        headerAction={
          <OutlineButton tone="green" onClick={() => setOpen(undefined)}>
            {term("comms.newOrder")}
          </OutlineButton>
        }
      />
    );
  }

  return (
    <OverseerCommsBody
      {...(comms.message ? { message: comms.message } : {})}
      {...(overseer ? { overseerLook: overseer.look } : {})}
      onApprove={comms.approve}
      onDeny={comms.deny}
      onNext={comms.next}
      onOrder={(text) => {
        comms.order(text, settings, (sessionId) => {
          setStarted(sessionId);
          setOpen(sessionId);
          setSettings(null);
        });
        onOrdered?.();
      }}
      busy={comms.busy}
      paused={paused}
      orderFoot={
        overseer ? (
          <ModelPicker
            compact
            value={settings ?? undefined}
            agentModel={overseerModel}
            onChange={setSettings}
          />
        ) : null
      }
    />
  );
}
