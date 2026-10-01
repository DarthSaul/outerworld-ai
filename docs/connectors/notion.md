# Notion connector

Outerworld AI connects to **Notion's hosted MCP server** (`https://mcp.notion.com/mcp`) over
Streamable HTTP with OAuth (ADR-0012). It is installed once for the station; each crew member is
either granted it or not.

## What granting Notion means

Every crew member you grant Notion **acts as the Notion account you sign in with**, on everything
that account can reach. Notion's hosted server has no per-page scoping. Outerworld AI's limits are:

- **The grant itself.** A crew member without it never sees Notion's tools, and a call to one is
  refused.
- **Consent.** Under *Ask first*, every Notion call that changes something (create or update a
  page, move, duplicate, comment, create a database or view, upload) waits for your approval,
  showing the exact input. Searches and fetches run without asking. The read/write classification
  is ours (`packages/core/src/policy/connector-tools.ts`); a tool we do not know counts as a write.
  Under *Full power*, nothing asks.

If you want a smaller blast radius, **sign in with a dedicated Notion account** that can see only
the pages you want agents to touch.

## Set up

1. Open **Connectors** in Outerworld AI. If there is no Notion card, click **Add Notion**. If the
   card's server URL is not `https://mcp.notion.com/mcp` (the demo station uses a placeholder),
   change it and click **Save URL**.
2. Click **Connect**. Notion needs sign-in, so a **Sign in to Notion** link appears: open it,
   sign in, and choose the workspace.
3. Notion sends you back to `http://127.0.0.1:<port>/oauth/callback/notion`. The daemon checks the
   one-time `state`, exchanges the code, and connects. The page says **Connected**; close it.
4. The card shows Notion's tools with their read/write class. Grant Notion to a crew member in
   **Crew → the crew member → Connectors**.

The daemon registers itself with Notion as a public OAuth client named "Outerworld AI" whose
redirect is the loopback callback above. The registration and the tokens are stored in your OS
keychain (service `outerworld-ai`, accounts `mcp.notion.client` and `mcp.notion.tokens`), never on
disk or in the browser. The daemon refreshes tokens itself and reconnects on its next start.

If the daemon's port changes, it registers again (the redirect changed) and you sign in once more.

## Disconnect

- **Disconnect** closes the connection; the next Connect reuses your sign-in.
- **Disconnect and forget sign-in** also deletes the registration and tokens from the keychain.
  To revoke Outerworld AI's access on Notion's side too, remove it in Notion's settings under
  connections.

## Smoke test (manual, real network)

Tests and CI never reach Notion. After signing in once in the app, you can check the real server:

```
OUTERWORLD_SMOKE_NOTION=1 OUTERWORLD_ALLOW_NETWORK=1 OUTERWORLD_HOME=~/.outerworld \
  pnpm --filter @darthsaul/outerworld-ai-runtime exec vitest run src/mcp/notion.smoke.test.ts
```

It connects with the stored sign-in and lists Notion's tools, printing each tool's annotations
next to our classification, without calling any tool.
