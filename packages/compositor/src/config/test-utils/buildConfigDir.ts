import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { onTestFinished } from 'vitest';

/**
 * A directory holding each path in `files` with the given content, removed when the test ends.
 *
 * Writes a real tree rather than mocking the filesystem, because what loading answers is how Node reports an absent
 * file against a present one -- the very layer a mock would replace with an assumption.
 */
export async function buildConfigDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'compositor-config-'));
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
