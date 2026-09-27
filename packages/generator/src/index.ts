/**
 * @darthsaul/outerworld-ai-generator
 *
 * Station → ledger-repo files. Pure functions in this module; `cli.ts` is the only place that
 * touches the filesystem. Knows nothing about rendering.
 */
import { SCHEMA_VERSION } from "@darthsaul/outerworld-ai-core";

/** A file the generator wants written, relative to the ledger repo root. */
export interface EmittedFile {
  readonly path: string;
  readonly contents: string;
}

/** The schema version this generator emits ledgers for. */
export const GENERATOR_SCHEMA_VERSION = SCHEMA_VERSION;

/** Sorts emitted files by path so output is deterministic regardless of emit order. */
export function sortEmitted(files: readonly EmittedFile[]): EmittedFile[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
