import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertKitImportsResolve } from '../kitImports/assertKitImportsResolve.ts';
import { assertIsRdyKit } from '../kits/assertIsRdyKit.ts';
import type { LoadedRdyKit } from '../kits/loadRdyKit.ts';
import { resolveKitExports } from '../kits/resolveKitExports.ts';
import { validateKit } from '../kits/validateKit.ts';
import { isRecord } from '../portable/isRecord.ts';
import { RemoteFetchError } from './RemoteFetchError.ts';

export interface LoadRemoteKitOptions {
  url: string;
  headers?: Record<string, string> | undefined;
}

/**
 * Fetches a remote `.js` kit bundle, evaluates it, and returns the validated RdyKit alongside its
 * embedded `__readyupVersion`, which is undefined for a kit compiled before that field existed or
 * fetched from a third-party source that omits it.
 *
 * Any supplied headers are sent with the request. This has no auth-scheme knowledge of its own, so `Authorization` and
 * anything else, such as a corporate proxy or telemetry header, arrive already formatted. The fetched content is
 * written to a temp file for dynamic import and cleaned up afterwards. Throws `RemoteFetchError` for a non-2xx
 * response, and a plain `Error` for a body that is not an evaluable kit.
 */
export async function loadRemoteKit({ url, headers = {} }: LoadRemoteKitOptions): Promise<LoadedRdyKit> {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new RemoteFetchError(
      `Failed to fetch remote kit from ${url}: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  const body = await response.text();

  // Detect HTML error pages (e.g., GitHub 404 pages that return 200)
  const trimmedBody = body.trimStart().toLowerCase();
  if (trimmedBody.startsWith('<html') || trimmedBody.startsWith('<!doctype')) {
    throw new Error(`Remote kit URL returned an HTML page instead of JavaScript: ${url}`);
  }

  // Check the fetched source before it is written and imported: a native import would fail a missing named export
  // as an opaque link error naming neither the kit nor the symbol.
  await assertKitImportsResolve(body, url);

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
    const versionValue = moduleRecord['__readyupVersion'];
    const compileTimeVersion = typeof versionValue === 'string' ? versionValue : undefined;
    const resolved = resolveKitExports(moduleRecord);
    assertIsRdyKit(resolved, url);
    validateKit(resolved);
    return { kit: resolved, compileTimeVersion };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
