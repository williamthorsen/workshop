import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { collectSourceFiles } from '../collectSourceFiles.ts';

/** A source directory holding kits at the top level and below it, helpers, tests, a hidden file, and a non-source. */
const SOURCE_TREE = {
  '__tests__/deploy.unit.test.ts': 'export {};',
  'deploy.ts': 'export default {};',
  'lib/.draft.ts': 'export {};',
  'lib/helper.ts': 'export {};',
  'notes.md': '# Notes',
  'smoke.ts': 'export default {};',
  'teams/ops/rotate.ts': 'export default {};',
};

describe(collectSourceFiles, () => {
  it('selects every TypeScript source, sorted, when neither key narrows the selection', () => {
    using temp = createSourceTree();

    expect(collectSourceFiles(temp.dir, { include: undefined, exclude: [] })).toStrictEqual([
      '__tests__/deploy.unit.test.ts',
      'deploy.ts',
      'lib/.draft.ts',
      'lib/helper.ts',
      'smoke.ts',
      'teams/ops/rotate.ts',
    ]);
  });

  it('selects the sources that match any of several include globs', () => {
    using temp = createSourceTree();

    expect(collectSourceFiles(temp.dir, { include: ['*.ts', 'teams/**/*.ts'], exclude: [] })).toStrictEqual([
      'deploy.ts',
      'smoke.ts',
      'teams/ops/rotate.ts',
    ]);
  });

  it('removes every source below an excluded directory, hidden files included', () => {
    using temp = createSourceTree();

    expect(collectSourceFiles(temp.dir, { include: undefined, exclude: ['lib/**', '**/__tests__/**'] })).toStrictEqual([
      'deploy.ts',
      'smoke.ts',
      'teams/ops/rotate.ts',
    ]);
  });

  it('removes a source that both an include glob and an exclude pattern match', () => {
    using temp = createSourceTree();

    expect(collectSourceFiles(temp.dir, { include: ['*.ts'], exclude: ['smoke.ts'] })).toStrictEqual(['deploy.ts']);
  });
});

// region | Helpers

/** Writes `SOURCE_TREE` to a temporary directory that is removed when the returned tree is disposed. */
function createSourceTree() {
  return createTempTree(SOURCE_TREE, { prefix: 'rdy-sources-' });
}

// endregion | Helpers
