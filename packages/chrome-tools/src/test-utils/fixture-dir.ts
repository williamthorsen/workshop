import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { onTestFinished } from 'vitest';

/**
 * Creates a fixture directory under TMPDIR, resolved through symlinks so that paths compare equal to the ones git and
 * `realpath` report, and removes it when the current test finishes.
 */
export function makeFixtureDir(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'thor-chrome-')));
  onTestFinished(() => {
    fs.rmSync(dir, { force: true, recursive: true });
  });
  return dir;
}

/** Writes a file below a root, creating its parent directories, and returns its absolute path. */
export function writeFixtureFile(root: string, relativePath: string, content = ''): string {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
