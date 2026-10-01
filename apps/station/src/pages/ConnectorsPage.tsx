import { term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  type ConnectorItem,
  useAddNotion,
  useConnect,
  useConnectors,
  useDisconnect,
  useRemoveConnector,
  useStationView,
  useUpdateConnector,
} from "../queries.js";

const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase no-underline hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";
const input =
  "flex-1 min-w-0 border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";

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
      className="flex flex-col gap-3 border-2 border-line bg-panel p-4 shadow-panel"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="m-0 font-display font-normal text-d10 text-cyan uppercase">
          {connector.name}
        </h2>
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
          <h3
            id={`${titleId}-tools`}
            className="m-0 font-display font-normal text-d7 text-fg-mute uppercase"
          >
            {term("connector.tools")}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-b17 text-fg">
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

/** Connectors (brief §12): installed once for the station; crew members are granted them. */
export function ConnectorsPage() {
  const connectors = useConnectors();
  const station = useStationView();
  const add = useAddNotion();
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const list = connectors.data ?? [];
  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-4">
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2"
      >
        {term("connectors")}
      </h1>
      <ErrorNote error={connectors.error ?? add.error} />
      {connectors.isSuccess && list.length === 0 ? (
        <EmptyState
          title={term("empty.connectors.title")}
          body={term("empty.connectors.body")}
          action={
            <button
              type="button"
              className={button}
              disabled={add.isPending}
              onClick={() => add.mutate()}
            >
              {term("connector.addNotion")}
            </button>
          }
        />
      ) : (
        list.map((c) => <ConnectorCard key={c.id} connector={c} nameOf={nameOf} />)
      )}
    </section>
  );
}
