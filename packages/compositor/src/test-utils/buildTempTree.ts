import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { onTestFinished } from 'vitest';

/**
 * Builds a temporary directory holding each path in `files` with the given content, removed when the test ends.
 *
 * What the code under test answers is how Node reports directories, extensions, and absences -- the very layer a mock
 * would replace with an assumption.
 *
 * `prefix` names the temp directory, so a test building several trees can tell which directory belongs to which, and a
 * directory left behind by a crashed run still names the suite that made it.
 *
 * A file's content is text or the bytes themselves, since a body no UTF-8 reading survives is unwritable as a string
 * and is exactly what a test of byte-for-byte handling needs.
 */
export async function buildTempTree(
  files: Record<string, string | Uint8Array>,
  prefix = 'compositor',
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return dir;
}
