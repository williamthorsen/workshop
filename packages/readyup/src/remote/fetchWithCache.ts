import { parseCacheControl, parseDeltaSeconds } from '../portable/parseCacheControl.ts';
import { type CacheEntry, readCacheEntry, removeCacheEntry, writeCacheEntry } from './cache-entries.ts';

const DEFAULT_TIMEOUT_MS = 30_000;

/** Statuses for which the `Response` constructor throws when given a body, even an empty one. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** Where the HTTP cache lives, and whether an invocation reads it. */
export interface HttpCacheSettings {
  dir: string;

  /** Whether to fetch unconditionally without reading stored entries; what the fetch returns is still stored. */
  reload: boolean;
}

export interface FetchWithCacheOptions {
  /** The cache to use, or `undefined` to fetch without one. */
  cache: HttpCacheSettings | undefined;

  /** Builds the request headers; called at most once, and only when a request is sent. */
  resolveHeaders: () => Record<string, string> | undefined;

  /** How long a request may take, from sending it to reading the last byte of its body; 30 seconds by default. */
  timeoutMs?: number;
}

/**
 * Fetches a URL through a private HTTP cache, serving a stored body without a request while it is fresh.
 *
 * An entry is fresh for the response's `max-age`, less its `Age`. A stale entry is revalidated with its validator,
 * and a 304 is returned as a 200 containing the stored body, so that a caller treats a cached response as it would a fetched
 * one. Every other response is returned with the same status, headers, and body. Only `http:` and `https:` URLs are
 * cached, and a cache that cannot be read or written leaves the fetch uncached rather than failing it.
 *
 * Every request sent, its body included, must finish within `timeoutMs`, or the fetch rejects with an error naming
 * the URL and the limit. A stale entry whose revalidation times out is not served.
 */
export async function fetchWithCache(
  url: string,
  { cache, resolveHeaders, timeoutMs = DEFAULT_TIMEOUT_MS }: FetchWithCacheOptions,
): Promise<Response> {
  if (cache === undefined || !isHttpUrl(url)) {
    return sendRequest(url, resolveHeaders() ?? {}, timeoutMs);
  }

  const storedEntry = cache.reload ? undefined : await readCacheEntry(cache.dir, url);
  if (storedEntry !== undefined && isFresh(storedEntry)) {
    return buildCachedResponse(storedEntry.body);
  }

  const headers = {
    ...resolveHeaders(),
    ...(storedEntry !== undefined && buildConditionalHeaders(storedEntry)),
  };
  const response = await sendRequest(url, headers, timeoutMs);

  if (storedEntry !== undefined && response.status === 304) {
    await writeCacheEntry(cache.dir, refreshEntry(storedEntry, response.headers));
    return buildCachedResponse(storedEntry.body);
  }

  if (response.status !== 200) return response;

  // A body can be read only once, so the caller receives a response rebuilt from the text read here.
  const body = await response.text();
  const entry = buildEntry(url, response.headers, body);
  if (entry === undefined) {
    await removeCacheEntry(cache.dir, url);
  } else {
    await writeCacheEntry(cache.dir, entry);
  }

  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// region | Helpers

/** Returns a successful response containing a stored body. */
function buildCachedResponse(body: string): Response {
  return new Response(body, { status: 200, statusText: 'OK' });
}

/** Returns the header asking the server to confirm a stored entry, or no header when the entry has no validator. */
function buildConditionalHeaders(entry: CacheEntry): Record<string, string> {
  if (entry.etag !== undefined) return { 'If-None-Match': entry.etag };
  if (entry.lastModified !== undefined) return { 'If-Modified-Since': entry.lastModified };
  return {};
}

/**
 * Builds the entry to store for a 200 response, or returns `undefined` when the response may not be stored.
 *
 * A response is stored unless it forbids storage, provided that it declares a positive `max-age` or a validator
 * with which to revalidate it.
 */
function buildEntry(url: string, headers: Headers, body: string): CacheEntry | undefined {
  const { maxAgeSec, noCache, noStore } = parseCacheControl(headers.get('cache-control'));
  const etag = headers.get('etag') ?? undefined;
  const lastModified = headers.get('last-modified') ?? undefined;

  const hasFreshness = maxAgeSec !== undefined && maxAgeSec > 0;
  if (noStore || (!hasFreshness && etag === undefined && lastModified === undefined)) return undefined;

  return {
    ageSec: parseDeltaSeconds(headers.get('age')) ?? 0,
    body,
    etag,
    lastModified,
    maxAgeSec,
    noCache,
    storedAtMs: Date.now(),
    url,
    version: 1,
  };
}

/**
 * Reports whether an entry may be served without revalidation.
 *
 * An entry stored at a time later than the clock now reads is stale, so that a clock set back cannot extend freshness.
 */
function isFresh(entry: CacheEntry): boolean {
  if (entry.noCache || entry.maxAgeSec === undefined) return false;

  const elapsedMs = Date.now() - entry.storedAtMs;
  if (elapsedMs < 0) return false;

  return entry.ageSec + elapsedMs / 1_000 < entry.maxAgeSec;
}

/** Reports whether a URL uses a scheme whose responses the cache stores. */
function isHttpUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * Returns an entry updated by a 304 that confirmed it.
 *
 * Freshness restarts now. Header values that the 304 sends replace the stored ones, and those that it omits are kept.
 */
function refreshEntry(entry: CacheEntry, headers: Headers): CacheEntry {
  const cacheControl = headers.get('cache-control');
  const directives = cacheControl === null ? undefined : parseCacheControl(cacheControl);

  return {
    ...entry,
    ageSec: parseDeltaSeconds(headers.get('age')) ?? entry.ageSec,
    etag: headers.get('etag') ?? entry.etag,
    maxAgeSec: directives === undefined ? entry.maxAgeSec : directives.maxAgeSec,
    noCache: directives === undefined ? entry.noCache : directives.noCache,
    storedAtMs: Date.now(),
  };
}

/**
 * Sends a request and reads its whole body within a time limit, returning a response rebuilt from that body.
 *
 * Because this function reads the body here, the same limit applies to a stall partway through the body as to a
 * stall before the headers.
 */
async function sendRequest(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(url, { headers, signal });
    const text = await response.text();
    const body = NULL_BODY_STATUSES.has(response.status) ? null : text;
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error: unknown) {
    if (!signal.aborted) throw error;
    throw new Error(`Timed out after ${timeoutMs / 1_000}s fetching ${url}`, { cause: error });
  }
}

// endregion | Helpers
