import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { useTempDir } from '../../../test-utils/tempDir.ts';
import { listTrackedFiles } from '../listTrackedFiles.ts';

// Separated from the module's unit suite, which answers git from a stub: only real git escapes and quotes a path,
// so only real git can show that `-z` defeats it.
const temp = useTempDir({ prefix: 'rdy-tracked-', cwd: 'mock' });

describe(listTrackedFiles, () => {
  it('returns a path holding a non-ASCII byte intact and unquoted', async () => {
    temp.write('packages/ascii/index.ts', 'export const value = 1;\n');
    temp.write('packages/日本語/index.ts', 'export const value = 2;\n');
    initRepository();

    await expect(listTrackedFiles()).resolves.toStrictEqual(['packages/ascii/index.ts', 'packages/日本語/index.ts']);
  });

  it('returns undefined outside a git working tree', async () => {
    temp.write('packages/ascii/index.ts', 'export const value = 1;\n');

    await expect(listTrackedFiles()).resolves.toBeUndefined();
  });
});

// region | Helpers

/** Initializes a git repository over the temporary directory and stages everything in it. */
function initRepository(): void {
  execFileSync('git', ['-C', temp.dir, 'init', '--quiet']);
  // Pinned rather than inherited: quoting is git's default, and a reader whose global config disables it would
  // otherwise see this suite pass against a listing built without `-z`.
  execFileSync('git', ['-C', temp.dir, 'config', 'core.quotePath', 'true']);
  execFileSync('git', ['-C', temp.dir, 'add', '--all']);
}

// endregion | Helpers
