import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const cliPath = path.resolve(import.meta.dirname, '../../bin/rdy.ts');
const packageDir = path.resolve(import.meta.dirname, '../../..');

/**
 * Drives the real CLI, which is the only tier that shows where a spawned rdy looks for its README.
 *
 * A resolver reading the working directory would satisfy every in-process test, since those run with
 * the package as the working directory. Running from a directory that holds no README is what tells
 * the two apart.
 */
describe('rdy help, spawned', () => {
  it('prints the same section from inside the package and from an unrelated directory', () => {
    const fromPackage = runHelp('concepts', packageDir);
    const fromElsewhere = runHelp('concepts', tmpdir());

    expect(fromElsewhere).toBe(fromPackage);
  });

  it('prints a whole README section, subsections included', () => {
    const stdout = runHelp('concepts', tmpdir());

    expect(stdout.startsWith('## Concepts\n')).toBe(true);
    expect(stdout).toContain('### Thresholds');
    expect(stdout).not.toContain('## Authoring kits');
  });
});

// region | Helpers

/** Runs `rdy help <topic>` from a working directory and returns what it wrote to stdout. */
function runHelp(topic: string, cwd: string): string {
  return execFileSync(process.execPath, [cliPath, 'help', topic], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// endregion | Helpers
