/** The `Cache-Control` directives on which a private cache acts. */
export interface CacheControlDirectives {
  maxAgeSec: number | undefined;
  noCache: boolean;
  noStore: boolean;
}

/** The largest delta-seconds value that a cache must honor, per RFC 9111; a larger one is read as this. */
const MAX_DELTA_SECONDS = 2_147_483_648;

/**
 * Parses a `Cache-Control` header value into the directives on which a private cache acts.
 *
 * Directive names are case-insensitive, and only the first `max-age` counts. A `max-age` whose value is not a
 * non-negative integer counts as absent. A `no-cache` naming header fields is read as an unqualified `no-cache`.
 */
export function parseCacheControl(value: string | null): CacheControlDirectives {
  const directives: CacheControlDirectives = { maxAgeSec: undefined, noCache: false, noStore: false };
  if (value === null) return directives;

  let hasMaxAge = false;
  for (const part of value.split(',')) {
    const separatorIndex = part.indexOf('=');
    const name = (separatorIndex === -1 ? part : part.slice(0, separatorIndex)).trim().toLowerCase();

    if (name === 'max-age' && !hasMaxAge) {
      hasMaxAge = true;
      directives.maxAgeSec = separatorIndex === -1 ? undefined : parseDeltaSeconds(part.slice(separatorIndex + 1));
    } else if (name === 'no-cache') {
      directives.noCache = true;
    } else if (name === 'no-store') {
      directives.noStore = true;
    }
  }

  return directives;
}

/** Parses an HTTP delta-seconds value, optionally quoted, or returns `undefined` where it is not a non-negative integer. */
export function parseDeltaSeconds(value: string | null): number | undefined {
  if (value === null) return undefined;
  const unquoted = value.trim().replace(/^"(.*)"$/, '$1');
  if (!/^\d+$/.test(unquoted)) return undefined;
  return Math.min(Number(unquoted), MAX_DELTA_SECONDS);
}
