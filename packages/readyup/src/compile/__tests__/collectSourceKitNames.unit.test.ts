import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { collectSourceKitNames } from '../collectSourceKitNames.ts';

/** A source directory holding kits at the top level and below it, a shared module, and a hidden source. */
const SOURCE_TREE = {
  'deploy.ts': 'export default {};',
  'helpers/.draft.ts': 'export {};',
  'helpers/shared.ts': 'export {};',
  'notes.md': '# Notes',
  'teams/ops/rotate.ts': 'export default {};',
};

describe(collectSourceKitNames, () => {
  it('names every selected source by its path below the source directory', () => {
    using temp = createSourceTree();

    expect(collectSourceKitNames(temp.dir, { include: undefined, exclude: [] })).toStrictEqual([
      'deploy',
      'helpers/.draft',
      'helpers/shared',
      'teams/ops/rotate',
    ]);
  });

  it('omits a shared module that an exclude pattern removes', () => {
    using temp = createSourceTree();

    expect(collectSourceKitNames(temp.dir, { include: undefined, exclude: ['helpers/**'] })).toStrictEqual([
      'deploy',
      'teams/ops/rotate',
    ]);
  });

  it('omits a shared module that an include glob does not select', () => {
    using temp = createSourceTree();

    expect(collectSourceKitNames(temp.dir, { include: ['*.ts'], exclude: [] })).toStrictEqual(['deploy']);
  });

  it('returns no names for a source directory that does not exist', () => {
    using temp = createSourceTree();

    expect(collectSourceKitNames(path.join(temp.dir, 'absent'), { include: undefined, exclude: [] })).toStrictEqual([]);
  });
});

// region | Helpers

/** Writes `SOURCE_TREE` to a temporary directory that is removed when the returned tree is disposed. */
function createSourceTree() {
  return createTempTree(SOURCE_TREE, { prefix: 'rdy-source-kit-names-' });
}

// endregion | Helpers
