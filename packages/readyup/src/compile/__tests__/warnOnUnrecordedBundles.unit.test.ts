import { captureStdio, createTempTree, pointCwdAt, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { warnOnUnrecordedBundles, type WarnOnUnrecordedBundlesArgs } from '../warnOnUnrecordedBundles.ts';

describe(warnOnUnrecordedBundles, () => {
  it('warns on a bundle that no entry records and no swept kit names, on stderr and in the returned list', () => {
    using tree = createTempTree({ '.readyup/kits/old.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });
    using _cwd = pointCwdAt(tree.dir);
    using io = captureStdio();

    const warnings = warn(tree, {});

    expect(warnings).toStrictEqual([
      {
        code: 'bundle-unrecorded',
        message: 'old.js in .readyup/kits is not recorded in the manifest, and no source compiles to it.',
        remedy: 'Delete it if its kit was removed.',
      },
    ]);
    expect(io.stderr).toBe(
      'Warning: old.js in .readyup/kits is not recorded in the manifest, and no source compiles to it. Delete it if its kit was removed.\n',
    );
  });

  it('accounts for a bundle recorded by a manifest entry', () => {
    using tree = createTempTree({ '.readyup/kits/deploy.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });
    using _io = captureStdio();

    const warnings = warn(tree, { entries: [{ name: 'deploy', path: 'kits/deploy.js' }] });

    expect(warnings).toStrictEqual([]);
  });

  it('accounts for a bundle named for a swept kit, whatever became of the kit', () => {
    using tree = createTempTree({ '.readyup/kits/broken.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });
    using _io = captureStdio();

    const warnings = warn(tree, { sweptKitNames: new Set(['broken']) });

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
    using _io = captureStdio();

    expect(warn(tree, {})).toStrictEqual([]);
  });

  it('raises a warning for a nested bundle, named as the kit that would run it', () => {
    using tree = createTempTree({ '.readyup/kits/checks/helper.js': '' }, { prefix: 'rdy-unrecorded-bundles-' });
    using _io = captureStdio();

    expect(warn(tree, {})).toStrictEqual([
      {
        code: 'bundle-unrecorded',
        message: expect.stringContaining('checks/helper.js in'),
        remedy: 'Delete it if its kit was removed.',
      },
    ]);
  });

  it('raises nothing for an output directory that does not exist', () => {
    using tree = createTempTree({}, { prefix: 'rdy-unrecorded-bundles-' });
    using _io = captureStdio();

    expect(warn(tree, {})).toStrictEqual([]);
  });
});

// region | Helpers

/** Warns over the tree's `.readyup/kits`, against a manifest in `.readyup` that records nothing unless told otherwise. */
function warn(tree: TempTree, overrides: Partial<WarnOnUnrecordedBundlesArgs>) {
  return warnOnUnrecordedBundles({
    entries: [],
    manifestDir: tree.resolve('.readyup'),
    outDir: tree.resolve('.readyup/kits'),
    sweptKitNames: new Set(),
    ...overrides,
  });
}

// endregion | Helpers
