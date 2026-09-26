import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { ManifestSchema, type RdyManifest } from '../manifest/manifestSchema.ts';
import { isHtmlBody } from '../portable/isHtmlBody.ts';
import { fetchWithCache, type FetchWithCacheOptions } from './fetchWithCache.ts';
import { RemoteFetchError } from './RemoteFetchError.ts';

/** Thrown when a remote manifest URL responds with 404 or an HTML soft-404. */
export class RemoteManifestNotFoundError extends Error {
  constructor(url: string) {
    super(`No manifest found at ${url}`);
    this.name = 'RemoteManifestNotFoundError';
  }
}

export interface LoadRemoteManifestOptions extends FetchWithCacheOptions {
  url: string;
}

/**
 * Fetches a manifest from a URL and returns it parsed and schema-validated.
 *
 * The fetch goes through the HTTP cache when `cache` names one, and a body served from it is checked as a fetched
 * body is. `resolveHeaders` builds the headers of any request sent. This has no auth-scheme knowledge of its own,
 * so `Authorization` and anything else, such as a corporate proxy or telemetry header, are built already formatted.
 * Throws `RemoteManifestNotFoundError` for a 404 or an HTML soft-404, `RemoteFetchError` for any other non-2xx
 * response, and a plain `Error` for a fetch that times out, malformed JSON, or a schema-invalid body.
 */
export async function loadRemoteManifest({ url, ...fetchOptions }: LoadRemoteManifestOptions): Promise<RdyManifest> {
  const response = await fetchWithCache(url, fetchOptions);

  if (response.status === 404) {
    throw new RemoteManifestNotFoundError(url);
  }

  if (!response.ok) {
    throw new RemoteFetchError(
      `Failed to fetch manifest from ${url}: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  const body = await response.text();

  if (isHtmlBody(body)) {
    throw new RemoteManifestNotFoundError(url);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error: unknown) {
    throw chainError(`Manifest at ${url} is malformed`, error);
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Manifest at ${url} is malformed: ${result.error.message}`);
  }

  return result.data;
}
