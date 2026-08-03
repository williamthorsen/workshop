import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTempTree } from '../../test-utils/buildTempTree.ts';
import { readDirNames } from '../readDirNames.ts';

describe(readDirNames, () => {
  it('names the entries directly under the directory, files and directories alike', async () => {
    const dir = await buildTempTree({ 'notes.md': 'notes', 'nested/inner.md': 'inner' });

    await expect(readDirNames(dir)).resolves.toStrictEqual(expect.arrayContaining(['notes.md', 'nested']));
  });

  it('does not descend, so a nested entry is absent from the result', async () => {
    const dir = await buildTempTree({ 'nested/inner.md': 'inner' });

    await expect(readDirNames(dir)).resolves.toStrictEqual(['nested']);
  });

  it('reports an absent directory as carrying nothing', async () => {
    const dir = await buildTempTree({});

    await expect(readDirNames(path.join(dir, 'never-created'))).resolves.toStrictEqual([]);
  });

  it('fails rather than reporting an absence when the directory cannot be read', async () => {
    const dir = await buildTempTree({ 'locked/inner.md': 'inner' });
    const lockedDir = path.join(dir, 'locked');
    await chmod(lockedDir, 0o000);

    try {
      await expect(readDirNames(lockedDir)).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(lockedDir, 0o755);
    }
  });
});
