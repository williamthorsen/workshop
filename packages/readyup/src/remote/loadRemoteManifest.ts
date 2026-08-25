import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestSchema } from '../manifest/manifestSchema.ts';
import { RemoteFetchError } from './RemoteFetchError.ts';

/** Thrown when a remote manifest URL responds with 404 or an HTML soft-404. */
export class RemoteManifestNotFoundError extends Error {
  constructor(url: string) {
    super(`No manifest found at ${url}`);
    this.name = 'RemoteManifestNotFoundError';
  }
}

export interface LoadRemoteManifestOptions {
  url: string;
  headers?: Record<string, string> | undefined;
}

/**
 * Fetches a manifest from a URL and returns it parsed and schema-validated.
 *
 * Any supplied headers are sent with the request. This has no auth-scheme knowledge of its own, so
 * `Authorization` and anything else, such as a corporate proxy or telemetry header, arrive already
 * formatted. Throws `RemoteManifestNotFoundError` for a 404 or an HTML soft-404, `RemoteFetchError`
 * for any other non-2xx response, and a plain `Error` for malformed JSON or a schema-invalid body.
 */
export async function loadRemoteManifest({ url, headers = {} }: LoadRemoteManifestOptions): Promise<RdyManifest> {
  const response = await fetch(url, { headers });

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

  // Detect HTML error pages (e.g., GitHub 404 pages that return 200)
  const trimmedBody = body.trimStart().toLowerCase();
  if (trimmedBody.startsWith('<html') || trimmedBody.startsWith('<!doctype')) {
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
