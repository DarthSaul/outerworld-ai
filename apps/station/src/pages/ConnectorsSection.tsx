import {
  CONNECTOR_PRESET_IDS,
  CONNECTOR_PRESETS,
  ownClientProfile,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { ROUTES } from "../lib/routes.js";
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

const link = "text-cyan underline hover:text-fg-hi";

/** The provider's setup steps for this server, each with its console link (ADR-0019). */
function SetupSteps({
  connector,
  open,
}: {
  readonly connector: ConnectorItem;
  readonly open: boolean;
}) {
  const profile = ownClientProfile(connector.url);
  const listId = useId();
  if (!profile) return null;
  const words = { name: connector.name, scope: profile.scope ?? "" };
  return (
    <details open={open} className="flex flex-col gap-1">
      <summary
        id={listId}
        className="cursor-pointer font-display text-d7 text-panel-title uppercase"
      >
        {term("connector.client.steps")}
      </summary>
      <ol
        aria-labelledby={listId}
        className="m-0 mt-1 flex list-decimal flex-col gap-1 pl-5 text-b17 text-fg-soft marker:text-fg-mute"
      >
        {profile.setup.map((s, n) => {
          const id = `${listId}-${n}`;
          return (
            <li key={s.step}>
              <span id={id}>{termWith(s.step, words)}</span>
              {s.href ? (
                <>
                  {" "}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-describedby={id}
                    className={link}
                  >
                    {term("connector.setup.open")}
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/** The redirect URL to register with the provider, copied in one click. */
function RedirectUrl({ url }: { readonly url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-b17 text-fg-soft">
      <span>{term("connector.client.redirect")}:</span>
      <code className="break-all font-body text-b17 text-fg-hi">{url}</code>
      <button type="button" className={button} onClick={copy}>
        {term("connector.client.copy")}
      </button>
      <span role="status" className="text-green">
        {copied ? term("connector.client.copied") : ""}
      </span>
    </div>
  );
}

/**
 * For a server that registers no clients (ADR-0019): how to register the Commander's own OAuth
 * app, the redirect URL to register, and the app itself. What is saved is never shown back, only
 * that one is; saving starts the sign-in.
 */
function OwnClientForm({
  connector,
  ownClient,
  onSaved,
}: {
  readonly connector: ConnectorItem;
  readonly ownClient: NonNullable<ConnectorItem["ownClient"]>;
  readonly onSaved: () => void;
}) {
  const save = useSetConnectorClient();
  const client = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [replacing, setReplacing] = useState(false);
  const titleId = useId();
  const editing = !ownClient.set || replacing;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) return;
    save.mutate(
      {
        id: connector.id,
        clientId: clientId.trim(),
        ...(secret.trim() ? { clientSecret: secret.trim() } : {}),
      },
      {
        onSuccess: () => {
          setClientId("");
          setSecret("");
          setReplacing(false);
          void client.invalidateQueries({ queryKey: ["connectors"] });
          onSaved();
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
      <SetupSteps connector={connector} open={!ownClient.set} />
      <RedirectUrl url={ownClient.redirectUrl} />
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-display text-d7 text-fg-mute uppercase">
            {term("connector.client.id")}
            <input
              className={input}
              autoComplete="off"
              spellCheck={false}
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
          {ownClient.set ? (
            <button type="button" className={button} onClick={() => setReplacing(false)}>
              {term("connector.client.cancel")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="m-0 text-b17 text-green">
            {term("connector.client.set")}
          </p>
          <button type="button" className={button} onClick={() => setReplacing(true)}>
            {term("connector.client.replace")}
          </button>
        </div>
      )}
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
  // Where to sign in: what the connector asks for now (a refused tool call asks too), else
  // what Connect answered; never once it is connected.
  const signIn =
    connector.status === "connected"
      ? undefined
      : (connector.authorizationUrl ??
        (connect.data?.status === "needs_auth" ? connect.data.authorizationUrl : undefined));
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
        <OwnClientForm
          connector={connector}
          ownClient={connector.ownClient}
          onSaved={() => connect.mutate(connector.id)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {connector.status === "connected" ? (
          <>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => {
                // Connect's old answer would offer its stale sign-in link again.
                connect.reset();
                disconnect.mutate({ id: connector.id, forget: false });
              }}
            >
              {term("connector.disconnect")}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => {
                // Connect's old answer would offer its stale sign-in link again.
                connect.reset();
                disconnect.mutate({ id: connector.id, forget: true });
              }}
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

/** The presets not on the station yet, each one click from installed. */
function useAddable() {
  const connectors = useConnectors();
  const list = connectors.data ?? [];
  return {
    connectors,
    list,
    presets: connectors.isSuccess
      ? CONNECTOR_PRESET_IDS.filter((p) => !list.some((c) => c.id === p))
      : [],
  };
}

const panel = "flex scroll-mt-3.5 flex-col gap-3 border-2 border-line bg-panel p-3 shadow-panel";
const panelTitle = "m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1";

/**
 * Abilities › Discover: the connector presets (brief §12) not installed yet; the server and its
 * name come from core. Adding one moves it to Installed.
 */
export function ConnectorsDiscover() {
  const { connectors, presets } = useAddable();
  const add = useAddConnector();
  const navigate = useNavigate();
  return (
    <section aria-labelledby="discover-title" className={panel}>
      <h2 id="discover-title" className={panelTitle}>
        {term("abilities.discover")}
      </h2>
      <p className="m-0 text-b17 text-fg-soft">{term("abilities.discover.hint")}</p>
      <ErrorNote error={connectors.error ?? add.error} />
      {connectors.isSuccess && presets.length === 0 ? (
        <p className="m-0 text-b19 text-fg">{term("abilities.discover.none")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={button}
              disabled={add.isPending}
              onClick={() => add.mutate(p, { onSuccess: () => navigate(ROUTES.installed) })}
            >
              {termWith("connector.add", { name: CONNECTOR_PRESETS[p].name })}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Abilities › Installed: the connectors installed once for the station (brief §12); crew members
 * are granted them on their own page.
 */
export function ConnectorsInstalled() {
  const { connectors, list } = useAddable();
  const station = useStationView();
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  return (
    <section id="connectors" aria-labelledby="installed-title" className={panel}>
      <h2 id="installed-title" className={panelTitle}>
        {term("abilities.installed")}
      </h2>
      <p className="m-0 text-b17 text-fg-soft">{term("connectors.hint")}</p>
      <ErrorNote error={connectors.error} />
      {connectors.isSuccess && list.length === 0 ? (
        <EmptyState
          title={term("empty.connectors.title")}
          body={term("empty.connectors.body")}
          action={
            <Link to={ROUTES.discover} className={button}>
              {term("abilities.discover")}
            </Link>
          }
        />
      ) : (
        list.map((c) => <ConnectorCard key={c.id} connector={c} nameOf={nameOf} />)
      )}
    </section>
  );
}
