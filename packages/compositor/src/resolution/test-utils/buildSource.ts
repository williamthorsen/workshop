import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { onTestFinished } from 'vitest';

import type { SourceSpec } from '../../schemas/resolution-schemas.ts';

/**
 * A source directory holding each path in `files` with the given content, removed when the test ends.
 *
 * Writes a real tree rather than mocking the filesystem, because what enumeration and readability checking answer is
 * how Node reports directories, extensions, and absences -- the very layer a mock would replace with an assumption.
 *
 * `name` becomes the source's id, its name, and its temp-directory prefix, so a test resolving several sources can
 * tell which directory belongs to which.
 */
export async function buildSource(files: Record<string, string>, name = 'fixture'): Promise<SourceSpec> {
  const dir = await mkdtemp(path.join(tmpdir(), `compositor-${name}-`));
  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  return { id: name, name, origin: { kind: 'directory', location: dir }, dir };
}
