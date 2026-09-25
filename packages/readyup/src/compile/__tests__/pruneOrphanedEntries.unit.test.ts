import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { hashFile } from '../../verify/targetHash.ts';
import { pruneOrphanedEntries, type PruneOrphanedEntriesArgs } from '../pruneOrphanedEntries.ts';

/** Bundle contents as the compile wrote them. */
const COMPILED = 'export default {};';

describe(pruneOrphanedEntries, () => {
  it('deletes the bundle of an orphan that still matches its recorded hash, and drops its entry', () => {
    using tree = createProject({ 'kits/legacy.js': COMPILED });
    const entry = recordedEntry(tree, 'legacy');

    const outcome = prune(tree, { existingEntries: [entry] });

    expect(outcome).toStrictEqual({
      keptEntries: [],
      orphans: [{ kind: 'removed', bundlePath: tree.resolve('kits/legacy.js'), name: 'legacy' }],
    });
    expect(tree.exists('kits/legacy.js')).toBe(false);
  });

  it('deletes the bundle of an orphan whose entry recorded no hash', () => {
    using tree = createProject({ 'kits/legacy.js': COMPILED });

    const outcome = prune(tree, { existingEntries: [{ name: 'legacy', path: 'kits/legacy.js' }] });

    expect(outcome.orphans).toStrictEqual([
      { kind: 'removed', bundlePath: tree.resolve('kits/legacy.js'), name: 'legacy' },
    ]);
    expect(tree.exists('kits/legacy.js')).toBe(false);
  });

  it('leaves the entry and bundle of every kit that the sweep attempted', () => {
    using tree = createProject({ 'kits/deploy.js': COMPILED });

    const outcome = prune(tree, {
      existingEntries: [recordedEntry(tree, 'deploy')],
      sweptKitNames: new Set(['deploy']),
    });

    expect(outcome).toStrictEqual({ keptEntries: [], orphans: [] });
    expect(tree.exists('kits/deploy.js')).toBe(true);
  });

  it('leaves the bundle of an orphan that the sweep wrote, and drops its entry', () => {
    using tree = createProject({ 'kits/ops/deploy.js': COMPILED });

    const outcome = prune(tree, {
      existingEntries: [{ name: 'deploy', path: 'kits/ops/deploy.js' }],
      sweptBundlePaths: new Set([tree.resolve('kits/ops/deploy.js')]),
      sweptKitNames: new Set(['ops/deploy']),
    });

    expect(outcome).toStrictEqual({ keptEntries: [], orphans: [] });
    expect(tree.exists('kits/ops/deploy.js')).toBe(true);
  });

  it('removes the directories that deleting a nested orphan emptied, and keeps the output directory', () => {
    using tree = createProject({ 'kits/team-a/ops/legacy.js': COMPILED });

    const outcome = prune(tree, { existingEntries: [recordedEntry(tree, 'team-a/ops/legacy')] });

    expect(outcome.orphans).toStrictEqual([
      { kind: 'removed', bundlePath: tree.resolve('kits/team-a/ops/legacy.js'), name: 'team-a/ops/legacy' },
    ]);
    expect(tree.exists('kits/team-a')).toBe(false);
    expect(tree.exists('kits')).toBe(true);
  });

  it('leaves a directory that still contains a bundle after an orphan beside it is deleted', () => {
    using tree = createProject({ 'kits/ops/keep.js': COMPILED, 'kits/ops/legacy.js': COMPILED });

    prune(tree, { existingEntries: [recordedEntry(tree, 'ops/legacy')] });

    expect(tree.exists('kits/ops/legacy.js')).toBe(false);
    expect(tree.exists('kits/ops/keep.js')).toBe(true);
  });

  it('keeps a bundle edited since it was compiled, with its entry, and reports the drift', () => {
    using tree = createProject({ 'kits/stale.js': COMPILED });
    const entry = recordedEntry(tree, 'stale');
    tree.write('kits/stale.js', 'export default { edited: true };');

    const outcome = prune(tree, { existingEntries: [entry] });

    expect(outcome).toStrictEqual({
      keptEntries: [entry],
      orphans: [
        {
          kind: 'drift',
          bundlePath: tree.resolve('kits/stale.js'),
          name: 'stale',
          status: expect.objectContaining({ kind: 'drift', expected: entry.targetHash }),
        },
      ],
    });
    expect(tree.exists('kits/stale.js')).toBe(true);
  });

  it('deletes an edited bundle under force', () => {
    using tree = createProject({ 'kits/stale.js': COMPILED });
    const entry = recordedEntry(tree, 'stale');
    tree.write('kits/stale.js', 'export default { edited: true };');

    const outcome = prune(tree, { existingEntries: [entry], force: true });

    expect(outcome.keptEntries).toStrictEqual([]);
    expect(outcome.orphans).toStrictEqual([
      { kind: 'removed', bundlePath: tree.resolve('kits/stale.js'), name: 'stale' },
    ]);
    expect(tree.exists('kits/stale.js')).toBe(false);
  });

  it('drops without an outcome an entry whose bundle is already gone', () => {
    using tree = createProject({});

    const outcome = prune(tree, { existingEntries: [{ name: 'gone', path: 'kits/gone.js', targetHash: 'aaaa1111' }] });

    expect(outcome).toStrictEqual({ keptEntries: [], orphans: [] });
  });

  it('drops without an outcome an entry that records no path', () => {
    using tree = createProject({ 'kits/gone.js': COMPILED });

    const outcome = prune(tree, { existingEntries: [{ name: 'gone' }] });

    expect(outcome).toStrictEqual({ keptEntries: [], orphans: [] });
    expect(tree.exists('kits/gone.js')).toBe(true);
  });

  it('never deletes a bundle recorded outside the output directory', () => {
    using tree = createProject({ 'custom/elsewhere.js': COMPILED });

    const outcome = prune(tree, { existingEntries: [{ name: 'elsewhere', path: 'custom/elsewhere.js' }] });

    expect(outcome).toStrictEqual({ keptEntries: [], orphans: [] });
    expect(tree.exists('custom/elsewhere.js')).toBe(true);
  });

  it('keeps an entry whose bundle cannot be deleted, and reports the failure', () => {
    // A directory where the bundle belongs cannot be unlinked.
    using tree = createProject({ 'kits/stuck.js/': '' });
    const entry: RdyManifestKit = { name: 'stuck', path: 'kits/stuck.js' };

    const outcome = prune(tree, { existingEntries: [entry] });

    expect(outcome).toStrictEqual({
      keptEntries: [entry],
      orphans: [
        { kind: 'failed', bundlePath: tree.resolve('kits/stuck.js'), message: expect.any(String), name: 'stuck' },
      ],
    });
  });

  it('reports orphans in manifest order', () => {
    using tree = createProject({ 'kits/beta.js': COMPILED, 'kits/alpha.js': COMPILED });

    const outcome = prune(tree, {
      existingEntries: [recordedEntry(tree, 'beta'), recordedEntry(tree, 'alpha')],
    });

    expect(outcome.orphans.map((orphan) => orphan.name)).toStrictEqual(['beta', 'alpha']);
  });
});

// region | Helpers

/** Creates a project whose manifest directory is the tree root and whose output directory is `kits/`. */
function createProject(files: Record<string, string>): TempTree {
  return createTempTree(files, { prefix: 'rdy-prune-orphans-' });
}

/** Prunes against the tree, with no kit swept and no force unless the overrides say otherwise. */
function prune(tree: TempTree, overrides: Partial<PruneOrphanedEntriesArgs>) {
  return pruneOrphanedEntries({
    existingEntries: [],
    force: false,
    manifestDir: tree.dir,
    outDir: tree.resolve('kits'),
    sweptBundlePaths: new Set(),
    sweptKitNames: new Set(),
    ...overrides,
  });
}

/** Returns the entry that a compile records for `kits/<name>.js` as it now stands on disk. */
function recordedEntry(tree: TempTree, name: string): RdyManifestKit {
  const bundle = `kits/${name}.js`;
  return { name, path: bundle, source: `kits/${name}.ts`, targetHash: hashFile(tree.resolve(bundle)) };
}

// endregion | Helpers
