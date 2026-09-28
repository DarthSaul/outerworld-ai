/**
 * @darthsaul/outerworld-ai-generator
 *
 * Station → ledger-repo files. Pure functions; `cli.ts` is the only place `node:fs` appears.
 * Knows nothing about rendering. Contract: docs/SCHEMA.md §6.
 */
import { SCHEMA_VERSION } from "@darthsaul/outerworld-ai-core";

export { type CliIo, runCli } from "./cli.js";
export {
  type EmitOptions,
  type EmittedFile,
  emitAgentPersona,
  emitClaudeMd,
  emitGitkeeps,
  emitLedger,
  emitLedgerSkeleton,
  emitOverseerPrompt,
  emitPostDigestScript,
  emitRoutinePrompt,
  emitSkill,
  emitStationJson,
  emitStatusReadme,
  protectedPaths,
  sortEmitted,
} from "./emit/index.js";
export { scheduleLabel } from "./emit/text.js";

/** The schema version this generator emits ledgers for. */
export const GENERATOR_SCHEMA_VERSION = SCHEMA_VERSION;
