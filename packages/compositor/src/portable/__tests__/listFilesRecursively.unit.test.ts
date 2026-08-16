import { symlink } from 'node:fs/promises';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { listFilesRecursively } from '../listFilesRecursively.ts';

describe(listFilesRecursively, () => {
  it('names every file relative to the directory the walk started at', async () => {
    using tree = createTempTree({ 'notes.md': 'notes', 'style.md': 'style' });

    await expect(sorted(tree.dir)).resolves.toStrictEqual(['notes.md', 'style.md']);
  });

  it('reaches files nested below the walk root, joining segments with a posix separator', async () => {
    using tree = createTempTree({ 'deeply/nested/asset.json': '{}' });

    await expect(sorted(tree.dir)).resolves.toStrictEqual(['deeply/nested/asset.json']);
  });

  it('names files rather than the directories holding them', async () => {
    using tree = createTempTree({ 'nested/inner.md': 'inner' });

    await expect(sorted(tree.dir)).resolves.toStrictEqual(['nested/inner.md']);
  });

  it('skips nothing by default, so a dotfile is listed like any other content', async () => {
    using tree = createTempTree({ '.hidden': 'hidden', 'notes.md': 'notes' });

    await expect(sorted(tree.dir)).resolves.toStrictEqual(['.hidden', 'notes.md']);
  });

  it('leaves out an entry the caller skips by name', async () => {
    using tree = createTempTree({ '.hidden': 'hidden', 'notes.md': 'notes' });

    await expect(sorted(tree.dir, (name) => name.startsWith('.'))).resolves.toStrictEqual(['notes.md']);
  });

  it('does not descend into a skipped directory, so its contents cost nothing to leave out', async () => {
    using tree = createTempTree({ '.git/objects/deadbeef': 'object', 'notes.md': 'notes' });

    // The nested file's own name matches no skip rule, so listing it would mean the walk entered `.git` anyway.
    await expect(sorted(tree.dir, (name) => name.startsWith('.'))).resolves.toStrictEqual(['notes.md']);
  });

  it('reports an absent directory as carrying nothing', async () => {
    using tree = createTempTree({});

    await expect(sorted(path.join(tree.dir, 'never-created'))).resolves.toStrictEqual([]);
  });

  it('leaves out a symlink whose target is gone, rather than naming a file nothing can read', async () => {
    using tree = createTempTree({ 'notes.md': 'notes' });
    await symlink(path.join(tree.dir, 'never-created'), path.join(tree.dir, 'dangling'));

    await expect(sorted(tree.dir)).resolves.toStrictEqual(['notes.md']);
  });
});

// region | Helpers

/** Lists the files beneath `dir` in a stable order, so a test states content rather than enumeration order. */
async function sorted(dir: string, skipName?: (name: string) => boolean): Promise<Array<string>> {
  return (await listFilesRecursively(dir, skipName === undefined ? {} : { skipName })).toSorted();
}

// endregion | Helpers
