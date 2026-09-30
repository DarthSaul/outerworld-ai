/** The daemon injects its per-install token into the page it serves (ADR-0011). */
export function readToken(doc: Document): string | undefined {
  const content = doc.querySelector('meta[name="outerworld-token"]')?.getAttribute("content");
  return content ? content : undefined;
}

export interface ApiIssue {
  readonly path: string;
  readonly message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly ApiIssue[] = [],
  ) {
    super(message);
  }
}

export interface Api {
  get<T = unknown>(path: string): Promise<T>;
  /** POST, PUT, PATCH, or DELETE with an optional JSON body; `undefined` for 204. */
  send<T = unknown>(
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T>;
}

/** A tiny client for the daemon's `/api` routes. Every request carries the bearer token. */
export function createApi(options: { token: string; fetch?: typeof globalThis.fetch }): Api {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { authorization: `Bearer ${options.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetchImpl(`/api${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; issues?: ApiIssue[] };
      throw new ApiError(res.status, err.error ?? `HTTP ${res.status}`, err.issues ?? []);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
  return {
    get: <T>(path: string) => request<T>("GET", path),
    send: <T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) =>
      request<T>(method, path, body),
  };
}
