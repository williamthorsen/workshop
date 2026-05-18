import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertIsRdyKit } from './assertIsRdyKit.ts';
import type { LoadedRdyKit } from './config.ts';
import { isRecord } from './isRecord.ts';
import { resolveKitExports } from './resolveKitExports.ts';
import { validateKit } from './validateKit.ts';

export interface LoadRemoteKitOptions {
  url: string;
  headers?: Record<string, string> | undefined;
}

/**
 * Fetch a remote `.js` kit bundle, evaluate it, and return a validated RdyKit.
 *
 * Sends the supplied headers (if any) with the request; the helper has no auth-scheme knowledge —
 * callers pre-format `Authorization` and any other headers (e.g., proxy/telemetry in corporate environments).
 * Writes the fetched content to a temp file for dynamic import, then cleans up. Returns the kit
 * alongside the embedded `__readyupVersion` (undefined for kits compiled before that field existed
 * or fetched from third-party sources that omit it).
 */
export async function loadRemoteKit({ url, headers = {} }: LoadRemoteKitOptions): Promise<LoadedRdyKit> {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote kit from ${url}: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();

  // Detect HTML error pages (e.g., GitHub 404 pages that return 200)
  const trimmedBody = body.trimStart().toLowerCase();
  if (trimmedBody.startsWith('<html') || trimmedBody.startsWith('<!doctype')) {
    throw new Error(`Remote kit URL returned an HTML page instead of JavaScript: ${url}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'rdy-'));
  const tempFile = join(tempDir, 'kit.js');

  try {
    writeFileSync(tempFile, body, 'utf8');

    const fileUrl = `${pathToFileURL(tempFile).href}?t=${Date.now()}`;
    const imported: unknown = await import(fileUrl);
    // Narrow the module namespace to access exports. `import()` always returns an object,
    // but TypeScript types it as `any`; narrowing avoids unsafe-member-access lint errors.
    const moduleRecord = isRecord(imported) ? imported : {};
    // Read __readyupVersion from the raw namespace before resolveKitExports drops unknown fields.
    const versionValue = moduleRecord.__readyupVersion;
    const compileTimeVersion = typeof versionValue === 'string' ? versionValue : undefined;
    const resolved = resolveKitExports(moduleRecord);
    assertIsRdyKit(resolved);
    validateKit(resolved);
    return { kit: resolved, compileTimeVersion };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
