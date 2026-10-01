import { ApiError } from "../lib/api.js";

/** A failed request, in words: the daemon's message and, for 400/409, the issues it listed. */
export function ErrorNote({ error }: { readonly error: Error | null | undefined }) {
  if (!error) return null;
  const issues = error instanceof ApiError ? error.issues : [];
  return (
    <div
      role="alert"
      className="flex flex-col gap-(--ow-space-1) rounded-control border border-health-attention p-(--ow-space-2) text-label text-ink-1"
    >
      <p>{error.message}</p>
      {issues.length > 0 ? (
        <ul className="font-mono text-mono">
          {issues.map((i) => (
            <li key={`${i.path}:${i.message}`}>
              {i.path ? `${i.path}: ` : ""}
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
