import { ApiError } from "../lib/api.js";

/** A failed request, in words: the daemon's message and, for 400/409, the issues it listed. */
export function ErrorNote({ error }: { readonly error: Error | null | undefined }) {
  if (!error) return null;
  const issues = error instanceof ApiError ? error.issues : [];
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 border-2 border-red bg-well px-2.5 py-1.5 text-b17 text-red-text"
    >
      <p className="m-0">{error.message}</p>
      {issues.length > 0 ? (
        <ul className="m-0 list-none p-0 text-b15 text-fg-soft">
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
