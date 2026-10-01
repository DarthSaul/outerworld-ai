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
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";
const input =
  "h-(--ow-size-control-h-dense) min-w-0 flex-1 rounded-control border border-border-subtle bg-surface-raised px-(--ow-space-2) font-mono text-mono text-ink-1";

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
      className="flex flex-col gap-(--ow-space-3) rounded-panel border border-border-subtle p-(--ow-space-4)"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <h2 id={titleId} className="text-heading text-ink-1">
          {connector.name}
        </h2>
        <span
          role="status"
          aria-label={`${connector.name} status`}
          className="font-mono text-mono text-ink-2"
        >
          {term(`connectorStatus.${connector.status}`)}
          {connector.detail && connector.status === "error" ? `: ${connector.detail}` : ""}
        </span>
      </header>
      <form onSubmit={save} className="flex flex-wrap items-end gap-(--ow-space-2)">
        <label className="flex min-w-0 flex-1 flex-col gap-(--ow-space-1) text-label text-ink-2">
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
      <div className="flex flex-wrap items-center gap-(--ow-space-2)">
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
            className={`${button} inline-flex items-center border-health-attention`}
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
      {signIn ? <p className="text-caption text-ink-2">{term("connector.signInHint")}</p> : null}
      <ErrorNote error={connect.error ?? disconnect.error ?? update.error ?? remove.error} />
      <p className="text-label text-ink-2">
        {term("connector.grantedTo")}:{" "}
        {connector.grantedTo.length
          ? connector.grantedTo.map(nameOf).join(", ")
          : term("connector.nobody")}
      </p>
      {connector.tools.length > 0 ? (
        <section aria-labelledby={`${titleId}-tools`} className="flex flex-col gap-(--ow-space-1)">
          <h3 id={`${titleId}-tools`} className="font-mono text-eyebrow uppercase text-ink-3">
            {term("connector.tools")}
          </h3>
          <ul className="flex flex-col gap-(--ow-space-1) font-mono text-mono text-ink-1">
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
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
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
