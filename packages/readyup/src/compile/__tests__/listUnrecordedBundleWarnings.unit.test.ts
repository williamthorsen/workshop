import { createTempTree, pointCwdAt, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import {
  listUnrecordedBundleWarnings,
  type ListUnrecordedBundleWarningsArgs,
} from '../listUnrecordedBundleWarnings.ts';

describe(listUnrecordedBundleWarnings, () => {
  it('raises a warning for a bundle that no entry records and no swept kit names', () => {
    using tree = createTempTree({ '.readyup/kits/old.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });
    using _cwd = pointCwdAt(tree.dir);

    const warnings = listWarnings(tree, {});

    expect(warnings).toStrictEqual([
      {
        code: 'bundle-unrecorded',
        message: 'old.js in .readyup/kits is not recorded in the manifest, and no source compiles to it.',
        remedy: 'Delete it if its kit was removed.',
      },
    ]);
  });

  it('accounts for a bundle recorded by a manifest entry', () => {
    using tree = createTempTree({ '.readyup/kits/deploy.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });

    const warnings = listWarnings(tree, { entries: [{ name: 'deploy', path: 'kits/deploy.js' }] });

    expect(warnings).toStrictEqual([]);
  });

  it('accounts for a bundle named for a swept kit, whatever became of the kit', () => {
    using tree = createTempTree({ '.readyup/kits/broken.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });

    const warnings = listWarnings(tree, { sweptKitNames: new Set(['broken']) });

    expect(warnings).toStrictEqual([]);
  });

  it('considers only the visible bundles below the output directory', () => {
    using tree = createTempTree(
      {
        '.readyup/kits/.hidden.js': '',
        '.readyup/kits/notes.md': '',
        '.readyup/kits/source.ts': '',
      },
      { prefix: 'rdy-unrecorded-bundles-' },
    );

    expect(listWarnings(tree, {})).toStrictEqual([]);
  });

  it('raises a warning for a nested bundle, named as the kit that would run it', () => {
    using tree = createTempTree({ '.readyup/kits/checks/helper.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });

    expect(listWarnings(tree, {})).toStrictEqual([
      {
        code: 'bundle-unrecorded',
        message: expect.stringContaining('checks/helper.js in'),
        remedy: 'Delete it if its kit was removed.',
      },
    ]);
  });

  it('raises nothing for an output directory that does not exist', () => {
    using tree = createTempTree({}, { prefix: 'rdy-unrecorded-bundles-' });

    expect(listWarnings(tree, {})).toStrictEqual([]);
  });
});

// region | Helpers

/** Lists the warnings over the tree's `.readyup/kits`, against a manifest in `.readyup` that records nothing unless told otherwise. */
function listWarnings(tree: TempTree, overrides: Partial<ListUnrecordedBundleWarningsArgs>) {
  return listUnrecordedBundleWarnings({
    entries: [],
    manifestDir: tree.resolve('.readyup'),
    outDir: tree.resolve('.readyup/kits'),
    sweptKitNames: new Set(),
    ...overrides,
  });
}

// endregion | Helpers
