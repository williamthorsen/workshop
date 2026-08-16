import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { hashDirectory } from '../hashDirectory.ts';

describe(hashDirectory, () => {
  it('gives two trees holding the same files the same digest', async () => {
    using here = createTempTree({ 'SKILL.md': 'lint', 'run.mjs': 'v1' });
    using there = createTempTree({ 'SKILL.md': 'lint', 'run.mjs': 'v1' });

    await expect(hashDirectory(here.dir)).resolves.toBe(await hashDirectory(there.dir));
  });

  it('moves the digest when a file’s content changes', async () => {
    using before = createTempTree({ 'run.mjs': 'v1' });
    using after = createTempTree({ 'run.mjs': 'v2' });

    await expect(hashDirectory(before.dir)).resolves.not.toBe(await hashDirectory(after.dir));
  });

  it('moves the digest when a file is renamed but its bytes are not, so paths take part', async () => {
    using before = createTempTree({ 'run.mjs': 'v1' });
    using after = createTempTree({ 'start.mjs': 'v1' });

    await expect(hashDirectory(before.dir)).resolves.not.toBe(await hashDirectory(after.dir));
  });

  it('reaches files nested below the directory', async () => {
    using before = createTempTree({ 'data/rules.json': '{"a":1}' });
    using after = createTempTree({ 'data/rules.json': '{"a":2}' });

    await expect(hashDirectory(before.dir)).resolves.not.toBe(await hashDirectory(after.dir));
  });

  it('leaves a dotfile out, so tool state cannot move the digest', async () => {
    using bare = createTempTree({ 'SKILL.md': 'lint' });
    using withToolState = createTempTree({ '.DS_Store': 'tool state', 'SKILL.md': 'lint' });

    await expect(hashDirectory(bare.dir)).resolves.toBe(await hashDirectory(withToolState.dir));
  });

  it('leaves a dot directory’s contents out as well as the directory itself', async () => {
    using bare = createTempTree({ 'SKILL.md': 'lint' });
    using withToolState = createTempTree({ '.git/objects/deadbeef': 'object', 'SKILL.md': 'lint' });

    await expect(hashDirectory(bare.dir)).resolves.toBe(await hashDirectory(withToolState.dir));
  });

  it('digests an empty directory rather than failing on it', async () => {
    using tree = createTempTree({});

    await expect(hashDirectory(tree.dir)).resolves.toMatch(/^sha256:/);
  });
});
