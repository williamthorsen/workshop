import { describe, expect, it } from 'vitest';

import { buildTempTree } from '../../test-utils/buildTempTree.ts';
import { hashDirectory } from '../hashDirectory.ts';

describe(hashDirectory, () => {
  it('gives two trees holding the same files the same digest', async () => {
    const here = await buildTempTree({ 'SKILL.md': 'lint', 'run.mjs': 'v1' });
    const there = await buildTempTree({ 'SKILL.md': 'lint', 'run.mjs': 'v1' });

    await expect(hashDirectory(here)).resolves.toBe(await hashDirectory(there));
  });

  it('moves the digest when a file’s content changes', async () => {
    const before = await buildTempTree({ 'run.mjs': 'v1' });
    const after = await buildTempTree({ 'run.mjs': 'v2' });

    await expect(hashDirectory(before)).resolves.not.toBe(await hashDirectory(after));
  });

  it('moves the digest when a file is renamed but its bytes are not, so paths take part', async () => {
    const before = await buildTempTree({ 'run.mjs': 'v1' });
    const after = await buildTempTree({ 'start.mjs': 'v1' });

    await expect(hashDirectory(before)).resolves.not.toBe(await hashDirectory(after));
  });

  it('reaches files nested below the directory', async () => {
    const before = await buildTempTree({ 'data/rules.json': '{"a":1}' });
    const after = await buildTempTree({ 'data/rules.json': '{"a":2}' });

    await expect(hashDirectory(before)).resolves.not.toBe(await hashDirectory(after));
  });

  it('leaves a dotfile out, so tool state cannot move the digest', async () => {
    const bare = await buildTempTree({ 'SKILL.md': 'lint' });
    const withToolState = await buildTempTree({ '.DS_Store': 'tool state', 'SKILL.md': 'lint' });

    await expect(hashDirectory(bare)).resolves.toBe(await hashDirectory(withToolState));
  });

  it('leaves a dot directory’s contents out as well as the directory itself', async () => {
    const bare = await buildTempTree({ 'SKILL.md': 'lint' });
    const withToolState = await buildTempTree({ '.git/objects/deadbeef': 'object', 'SKILL.md': 'lint' });

    await expect(hashDirectory(bare)).resolves.toBe(await hashDirectory(withToolState));
  });

  it('digests an empty directory rather than failing on it', async () => {
    const dir = await buildTempTree({});

    await expect(hashDirectory(dir)).resolves.toMatch(/^sha256:/);
  });
});
