import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { onTestFinished } from 'vitest';

/**
 * Builds a temporary directory holding each path in `files` with the given content, removed when the test ends.
 *
 * Writes a real tree rather than mocking the filesystem, because what the code under test answers is how Node reports
 * directories, extensions, and absences -- the very layer a mock would replace with an assumption.
 *
 * `prefix` names the temp directory, so a test building several trees can tell which directory belongs to which, and a
 * directory left behind by a crashed run still names the suite that made it.
 */
export async function buildTempTree(files: Record<string, string>, prefix = 'compositor'): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  return dir;
}
