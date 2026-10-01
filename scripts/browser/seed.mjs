// Gives a fresh copy of fixtures/demo-station a little real history before screenshots (D25):
// everything goes through the daemon's API and the scripted fake model, so the map,
// Notifications, Memory, and schedules show what the runtime actually did. Nothing is invented.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function seed({ port, home }) {
  const token = readFileSync(join(home, "daemon.token"), "utf8").trim();
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`seed: ${method} ${path} → ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  };
  /** Waits until the session's latest run reaches one of `states`. */
  const until = async (sessionId, states) => {
    for (let i = 0; i < 200; i++) {
      const detail = await call("GET", `/sessions/${sessionId}`);
      if (states.includes(detail.runs[0]?.state)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`seed: session ${sessionId} never reached ${states.join(" or ")}`);
  };
  const say = async (agentId, title, text, states = ["completed"]) => {
    const session = await call("POST", `/agents/${agentId}/sessions`, { title });
    await call("POST", `/sessions/${session.id}/messages`, { text });
    await until(session.id, states);
    return session;
  };

  await say(
    "wren",
    "Sources",
    'use remember {"text":"The Commander wants sources as a short list.","scope":"agent"}',
  );
  await say("vesper", "Morning check", "Good morning. Anything I should know?");
  const fire = await call("POST", "/agents/quill/schedules/daily-briefing/run");
  await until(fire.sessionId, ["completed"]);
  await say("quill", "Hub notes", 'use write_file {"path":"notes.md","content":"Next steps"}', [
    "awaiting_consent",
  ]);
}
