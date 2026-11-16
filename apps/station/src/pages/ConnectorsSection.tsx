import {
  CONNECTOR_PRESET_IDS,
  CONNECTOR_PRESETS,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  type ConnectorItem,
  useAddConnector,
  useConnect,
  useConnectors,
  useDisconnect,
  useRemoveConnector,
  useSetConnectorClient,
  useStationView,
  useUpdateConnector,
} from "../queries.js";

const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase no-underline hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";
const input =
  "flex-1 min-w-0 border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";

/**
 * For a server that registers no clients (ADR-0019): the redirect URL to register, and the
 * Commander's own OAuth app. What is saved is never shown back, only that one is.
 */
function OwnClientForm({
  connector,
  ownClient,
}: {
  readonly connector: ConnectorItem;
  readonly ownClient: NonNullable<ConnectorItem["ownClient"]>;
}) {
  const save = useSetConnectorClient();
  const client = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const titleId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) return;
    save.mutate(
      { id: connector.id, clientId, ...(secret.trim() ? { clientSecret: secret } : {}) },
      {
        onSuccess: () => {
          setClientId("");
          setSecret("");
          void client.invalidateQueries({ queryKey: ["connectors"] });
        },
      },
    );
  };
  return (
    <form
      aria-labelledby={titleId}
      onSubmit={submit}
      className="flex flex-col gap-2 border border-line-faint p-2"
    >
      <h4 id={titleId} className="m-0 font-display font-normal text-d7 text-fg-mute uppercase">
        {term("connector.client")}
      </h4>
      <p className="m-0 text-b17 text-fg-soft">
        {termWith("connector.client.hint", { name: connector.name })}
      </p>
      <p className="m-0 flex flex-wrap gap-2 text-b17 text-fg-soft">
        <span>{term("connector.client.redirect")}:</span>
        <code className="break-all text-fg-hi">{ownClient.redirectUrl}</code>
      </p>
      {ownClient.set ? (
        <p role="status" className="m-0 text-b17 text-green">
          {term("connector.client.set")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-display text-d7 text-fg-mute uppercase">
          {term("connector.client.id")}
          <input
            className={input}
            autoComplete="off"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-display text-d7 text-fg-mute uppercase">
          {term("connector.client.secret")}
          <input
            className={input}
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        <button type="submit" className={button} disabled={!clientId.trim() || save.isPending}>
          {term("connector.client.save")}
        </button>
      </div>
      <ErrorNote error={save.error} />
    </form>
  );
}

function ConnectorCard({
  connector,
  nameOf,
}: {
  readonly connector: ConnectorItem;
  readonly nameOf: (id: string) => string;
}) {
  const connect = useConnect();
  const disconnect = useDisconnect();
  const update = useUpdateConnector();
  const remove = useRemoveConnector();
  const [url, setUrl] = useState<string | null>(null);
  const signIn = connect.data?.status === "needs_auth" ? connect.data.authorizationUrl : undefined;
  const busy = connect.isPending || disconnect.isPending;
  const titleId = `connector-${connector.id}`;
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (url) update.mutate({ id: connector.id, url }, { onSuccess: () => setUrl(null) });
  };

  return (
    <section
      aria-labelledby={titleId}
      data-connector={connector.id}
      data-connector-status={connector.status}
      className="flex flex-col gap-3 border-2 border-line-soft bg-well p-3"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="m-0 font-display font-normal text-d10 text-cyan uppercase">
          {connector.name}
        </h3>
        <span
          role="status"
          aria-label={`${connector.name} status`}
          className="text-b17 text-fg-mute"
        >
          {term(`connectorStatus.${connector.status}`)}
          {connector.detail && connector.status === "error" ? `: ${connector.detail}` : ""}
        </span>
      </header>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-display text-d7 text-fg-mute uppercase">
          {term("connector.url")}
          <input
            className={input}
            value={url ?? connector.url ?? ""}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button type="submit" className={button} disabled={url === null || update.isPending}>
          {term("connector.save")}
        </button>
      </form>
      {connector.ownClient ? (
        <OwnClientForm connector={connector} ownClient={connector.ownClient} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {connector.status === "connected" ? (
          <>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => disconnect.mutate({ id: connector.id, forget: false })}
            >
              {term("connector.disconnect")}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => disconnect.mutate({ id: connector.id, forget: true })}
            >
              {term("connector.forget")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => connect.mutate(connector.id)}
          >
            {term("connector.connect")}
          </button>
        )}
        {signIn ? (
          <a
            href={signIn}
            target="_blank"
            rel="noopener noreferrer"
            className={`${button} inline-flex items-center border-amber`}
          >
            {term("connector.signIn")} {connector.name}
          </a>
        ) : null}
        {connector.grantedTo.length === 0 ? (
          <button
            type="button"
            className={button}
            disabled={remove.isPending}
            onClick={() => remove.mutate(connector.id)}
          >
            {term("connector.remove")}
          </button>
        ) : null}
      </div>
      {signIn ? <p className="m-0 text-b17 text-fg-mute">{term("connector.signInHint")}</p> : null}
      <ErrorNote error={connect.error ?? disconnect.error ?? update.error ?? remove.error} />
      <p className="m-0 text-b17 text-fg-soft">
        {term("connector.grantedTo")}:{" "}
        {connector.grantedTo.length
          ? connector.grantedTo.map(nameOf).join(", ")
          : term("connector.nobody")}
      </p>
      {connector.tools.length > 0 ? (
        <section aria-labelledby={`${titleId}-tools`} className="flex flex-col gap-1">
          <h4
            id={`${titleId}-tools`}
            className="m-0 font-display font-normal text-d7 text-fg-mute uppercase"
          >
            {term("connector.tools")}
          </h4>
          {/* A long tool list scrolls in its own box instead of stretching the card. */}
          <ul
            aria-labelledby={`${titleId}-tools`}
            data-tools
            className="m-0 flex max-h-48 list-none flex-col gap-1 overflow-y-auto overscroll-y-contain border border-line-faint bg-well p-2 text-b17 text-fg"
          >
            {connector.tools.map((t) => (
              <li key={t.name} data-tool={t.name} data-class={t.class}>
                {t.name} · {term(`grant.${t.class}`)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/**
 * Connectors (brief §12): installed once for the station; crew members are granted them. A
 * section of Settings (ADR-0014), at `/settings/connectors`.
 */
export function ConnectorsSection() {
  const connectors = useConnectors();
  const station = useStationView();
  const add = useAddConnector();
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const list = connectors.data ?? [];
  // Each preset not on the station yet, in one click; the server and its name come from core.
  const presets = CONNECTOR_PRESET_IDS.filter((p) => !list.some((c) => c.id === p));
  const addButtons =
    connectors.isSuccess && presets.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={button}
            disabled={add.isPending}
            onClick={() => add.mutate(p)}
          >
            {termWith("connector.add", { name: CONNECTOR_PRESETS[p].name })}
          </button>
        ))}
      </div>
    ) : null;
  return (
    <section
      id="connectors"
      aria-labelledby="connectors-title"
      className="flex scroll-mt-3.5 flex-col gap-3 border-2 border-line bg-panel p-3 shadow-panel"
    >
      <h2
        id="connectors-title"
        className="m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
      >
        {term("connectors")}
      </h2>
      <p className="m-0 text-b17 text-fg-soft">{term("connectors.hint")}</p>
      <ErrorNote error={connectors.error ?? add.error} />
      {connectors.isSuccess && list.length === 0 ? (
        <EmptyState
          title={term("empty.connectors.title")}
          body={term("empty.connectors.body")}
          action={addButtons}
        />
      ) : (
        <>
          {list.map((c) => (
            <ConnectorCard key={c.id} connector={c} nameOf={nameOf} />
          ))}
          {addButtons ? (
            <section aria-labelledby="connectors-add" className="flex flex-col gap-2">
              <h3
                id="connectors-add"
                className="m-0 font-display font-normal text-d7 text-fg-mute uppercase"
              >
                {term("connector.add.title")}
              </h3>
              {addButtons}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
