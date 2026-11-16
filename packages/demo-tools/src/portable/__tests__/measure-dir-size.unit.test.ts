import { symlinkSync } from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { measureDirSize } from '../measure-dir-size.ts';

describe(measureDirSize, () => {
  it('sums the sizes of the files at every depth', () => {
    using tree = createTempTree({ 'config.json': '{}', 'weights/model-1.safetensors': 'abcdef' });

    expect(measureDirSize(tree.dir)).toBe(8);
  });

  it("counts a symlink's target", () => {
    using tree = createTempTree({ 'blobs/weights': 'abcd' });
    symlinkSync(tree.resolve('blobs/weights'), tree.resolve('model.safetensors'));

    expect(measureDirSize(tree.dir)).toBe(8);
  });

  it('throws when the directory is missing', () => {
    using tree = createTempTree({});

    expect(() => measureDirSize(tree.resolve('absent'))).toThrow('ENOENT');
  });
});
