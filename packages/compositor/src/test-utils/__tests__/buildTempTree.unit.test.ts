import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTempTree } from '../buildTempTree.ts';

describe(buildTempTree, () => {
  it('writes each entry at its path, with the content given', async () => {
    const dir = await buildTempTree({ 'skills/lint/SKILL.md': 'lint' });

    await expect(readFile(path.join(dir, 'skills/lint/SKILL.md'), 'utf8')).resolves.toBe('lint');
  });

  it('creates the parent directories an entry names, so a caller states paths rather than order', async () => {
    const dir = await buildTempTree({ 'deeply/nested/asset.json': '{}' });

    expect((await stat(path.join(dir, 'deeply/nested'))).isDirectory()).toBe(true);
  });

  it('builds an empty directory when given no entries', async () => {
    const dir = await buildTempTree({});

    await expect(readdir(dir)).resolves.toStrictEqual([]);
  });

  it('names the directory for the prefix, so a leaked one identifies the suite that made it', async () => {
    const dir = await buildTempTree({}, 'compositor-example');

    expect(path.basename(dir)).toMatch(/^compositor-example-/);
  });

  it('gives two trees separate directories, so one suite cannot read another’s fixture', async () => {
    const [first, second] = await Promise.all([buildTempTree({ 'a.md': 'a' }), buildTempTree({ 'b.md': 'b' })]);

    expect(first).not.toBe(second);
  });
});
