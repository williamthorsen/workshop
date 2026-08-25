import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

/** Reads the version compositor's own manifest declares, which every surface that states a version must agree with. */
export async function readManifestVersion(): Promise<string> {
  const manifestPath = path.join(import.meta.dirname, '..', '..', 'package.json');
  const manifest = z.object({ version: z.string() }).parse(JSON.parse(await readFile(manifestPath, 'utf8')));

  return manifest.version;
}
