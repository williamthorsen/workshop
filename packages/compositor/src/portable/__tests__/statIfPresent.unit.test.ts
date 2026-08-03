import { chmod, symlink } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTempTree } from '../../test-utils/buildTempTree.ts';
import { statIfPresent } from '../statIfPresent.ts';

describe(statIfPresent, () => {
  it('stats a file that is there', async () => {
    const dir = await buildTempTree({ 'notes.md': 'notes' });

    expect((await statIfPresent(path.join(dir, 'notes.md')))?.isFile()).toBe(true);
  });

  it('stats a directory that is there', async () => {
    const dir = await buildTempTree({ 'nested/inner.md': 'inner' });

    expect((await statIfPresent(path.join(dir, 'nested')))?.isDirectory()).toBe(true);
  });

  it('reports nothing for an absent path', async () => {
    const dir = await buildTempTree({});

    await expect(statIfPresent(path.join(dir, 'never-created'))).resolves.toBeUndefined();
  });

  it('reports nothing for a path below a regular file, which fails as ENOTDIR rather than ENOENT', async () => {
    const dir = await buildTempTree({ 'notes.md': 'notes' });

    await expect(statIfPresent(path.join(dir, 'notes.md', 'below'))).resolves.toBeUndefined();
  });

  it('follows a symlink to the directory it points at, which a linked install layout produces', async () => {
    const dir = await buildTempTree({ 'elsewhere/shared/SKILL.md': 'shared' });
    await symlink(path.join(dir, 'elsewhere/shared'), path.join(dir, 'linked'));

    expect((await statIfPresent(path.join(dir, 'linked')))?.isDirectory()).toBe(true);
  });

  it('reports nothing for a symlink whose target is gone, rather than the link itself', async () => {
    const dir = await buildTempTree({});
    await symlink(path.join(dir, 'never-created'), path.join(dir, 'dangling'));

    await expect(statIfPresent(path.join(dir, 'dangling'))).resolves.toBeUndefined();
  });

  it('fails rather than reporting an absence when the path cannot be reached', async () => {
    const dir = await buildTempTree({ 'locked/inner.md': 'inner' });
    const lockedDir = path.join(dir, 'locked');
    await chmod(lockedDir, 0o000);

    try {
      // Statting below an unsearchable directory fails with EACCES.
      await expect(statIfPresent(path.join(lockedDir, 'inner.md'))).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(lockedDir, 0o755);
    }
  });
});
