import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTempTree } from '../../test-utils/buildTempTree.ts';
import { readFileIfPresent } from '../readFileIfPresent.ts';

describe(readFileIfPresent, () => {
  it('reads a file that is there, as text', async () => {
    const dir = await buildTempTree({ 'notes.md': 'notes' });

    await expect(readFileIfPresent(path.join(dir, 'notes.md'))).resolves.toBe('notes');
  });

  it('reports nothing for an absent file', async () => {
    const dir = await buildTempTree({});

    await expect(readFileIfPresent(path.join(dir, 'never-created.md'))).resolves.toBeUndefined();
  });

  it('reports nothing for a path below a regular file, which fails as ENOTDIR rather than ENOENT', async () => {
    const dir = await buildTempTree({ 'notes.md': 'notes' });

    await expect(readFileIfPresent(path.join(dir, 'notes.md', 'below'))).resolves.toBeUndefined();
  });

  it('distinguishes an empty file from an absent one', async () => {
    const dir = await buildTempTree({ 'empty.md': '' });

    await expect(readFileIfPresent(path.join(dir, 'empty.md'))).resolves.toBe('');
  });

  it('fails rather than reporting an absence when the file cannot be read', async () => {
    const dir = await buildTempTree({ 'locked.md': 'locked' });
    const lockedFile = path.join(dir, 'locked.md');
    await chmod(lockedFile, 0o000);

    try {
      await expect(readFileIfPresent(lockedFile)).rejects.toThrow(/EACCES/);
    } finally {
      await chmod(lockedFile, 0o644);
    }
  });
});
