import type { RdyManifest } from './manifest/manifestSchema.ts';
import { ManifestSchema } from './manifest/manifestSchema.ts';

/** Thrown when a remote manifest URL responds with 404 or an HTML soft-404. */
export class RemoteManifestNotFoundError extends Error {
  constructor(url: string) {
    super(`No manifest found at ${url}`);
    this.name = 'RemoteManifestNotFoundError';
  }
}

export interface LoadRemoteManifestOptions {
  url: string;
  token?: string | undefined;
}

/**
 * Fetch, parse, and schema-validate a manifest from a URL.
 *
 * Sends `Authorization: token {token}` (GitHub-style) when a token is provided.
 * Throws `RemoteManifestNotFoundError` for 404 and HTML soft-404 responses,
 * and a plain `Error` for other non-2xx responses, malformed JSON, and schema-invalid bodies.
 */
export async function loadRemoteManifest({ url, token }: LoadRemoteManifestOptions): Promise<RdyManifest> {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers.Authorization = `token ${token}`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 404) {
    throw new RemoteManifestNotFoundError(url);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest from ${url}: ${response.status} ${response.statusText}`);
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
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Manifest at ${url} is malformed: ${detail}`);
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Manifest at ${url} is malformed: ${result.error.message}`);
  }

  return result.data;
}
