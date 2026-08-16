import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { readFileIfPresent } from '../readFileIfPresent.ts';

describe(readFileIfPresent, () => {
  it('reads a file that is there, as text', async () => {
    using tree = createTempTree({ 'notes.md': 'notes' });

    await expect(readFileIfPresent(path.join(tree.dir, 'notes.md'))).resolves.toBe('notes');
  });

  it('reports nothing for an absent file', async () => {
    using tree = createTempTree({});

    await expect(readFileIfPresent(path.join(tree.dir, 'never-created.md'))).resolves.toBeUndefined();
  });

  it('reports nothing for a path below a regular file, which fails as ENOTDIR rather than ENOENT', async () => {
    using tree = createTempTree({ 'notes.md': 'notes' });

    await expect(readFileIfPresent(path.join(tree.dir, 'notes.md', 'below'))).resolves.toBeUndefined();
  });

  it('distinguishes an empty file from an absent one', async () => {
    using tree = createTempTree({ 'empty.md': '' });

    await expect(readFileIfPresent(path.join(tree.dir, 'empty.md'))).resolves.toBe('');
  });

  it('fails rather than reporting an absence when the file cannot be read', async () => {
    using tree = createTempTree({ 'locked.md': 'locked' });
    const lockedFile = path.join(tree.dir, 'locked.md');
    await chmod(lockedFile, 0o000);

    try {
      await expect(readFileIfPresent(lockedFile)).rejects.toThrow(/EACCES/);
    } finally {
      await chmod(lockedFile, 0o644);
    }
  });
});
