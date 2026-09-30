/** The daemon injects its per-install token into the page it serves (ADR-0011). */
export function readToken(doc: Document): string | undefined {
  const content = doc.querySelector('meta[name="outerworld-token"]')?.getAttribute("content");
  return content ? content : undefined;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Api {
  get<T = unknown>(path: string): Promise<T>;
}

/** A tiny client for the daemon's `/api` routes. Every request carries the bearer token. */
export function createApi(options: { token: string; fetch?: typeof globalThis.fetch }): Api {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetchImpl(`/api${path}`, {
        headers: { authorization: `Bearer ${options.token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    },
  };
}
