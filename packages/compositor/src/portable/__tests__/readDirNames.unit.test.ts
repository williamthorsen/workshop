import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { readDirNames } from '../readDirNames.ts';

describe(readDirNames, () => {
  it('names the entries directly under the directory, files and directories alike', async () => {
    using tree = createTempTree({ 'notes.md': 'notes', 'nested/inner.md': 'inner' });

    await expect(readDirNames(tree.dir)).resolves.toStrictEqual(expect.arrayContaining(['notes.md', 'nested']));
  });

  it('does not descend, so a nested entry is absent from the result', async () => {
    using tree = createTempTree({ 'nested/inner.md': 'inner' });

    await expect(readDirNames(tree.dir)).resolves.toStrictEqual(['nested']);
  });

  it('reports an absent directory as containing no name', async () => {
    using tree = createTempTree({});

    await expect(readDirNames(path.join(tree.dir, 'never-created'))).resolves.toStrictEqual([]);
  });

  it('fails rather than reporting an absence when the directory cannot be read', async () => {
    using tree = createTempTree({ 'locked/inner.md': 'inner' });
    const lockedDir = path.join(tree.dir, 'locked');
    await chmod(lockedDir, 0o000);

    try {
      await expect(readDirNames(lockedDir)).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(lockedDir, 0o755);
    }
  });
});
