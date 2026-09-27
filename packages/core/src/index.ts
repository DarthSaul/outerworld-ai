/**
 * @darthsaul/outerworld-ai-core
 *
 * Headless: zero React, zero DOM, zero filesystem. The Station and StationState schemas
 * defined here are the product's real API; ui and generator both key off them.
 */

/** Current Station / StationState schema version. Bumped per docs/decisions (schema versioning ADR). */
export const SCHEMA_VERSION = 1 as const;

/** Returns true when a document's `schemaVersion` can be read by this build. */
export function isSupportedSchemaVersion(version: unknown): version is typeof SCHEMA_VERSION {
  return version === SCHEMA_VERSION;
}
