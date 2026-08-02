import { describe, expect, it } from 'vitest';

import { buildConfig, type TierInput } from '../../config/test-utils/buildConfig.ts';
import { selectArtifacts, type Selection } from '../selectArtifacts.ts';
import { buildCatalog } from '../test-utils/buildCatalog.ts';

const catalog = buildCatalog({
  kinds: ['rulebook', 'skill'],
  sources: ['local', 'acme'],
  entries: [
    { kindId: 'skill', slug: 'lint', carriedBy: ['acme'] },
    { kindId: 'skill', slug: 'format', carriedBy: ['acme'] },
    // Carried by both, and won by the higher-precedence source: acme still carries it.
    { kindId: 'skill', slug: 'review', carriedBy: ['local', 'acme'] },
    { kindId: 'rulebook', slug: 'house-style', carriedBy: ['local'] },
  ],
});

describe(selectArtifacts, () => {
  it('seeds an artifact a tier names', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['lint'] } } }]);

    expect(selection.seeded).toStrictEqual([
      { artifactId: 'skill:lint', seededBy: [{ via: 'declaration', tierId: 'project' }] },
    ]);
  });

  it('seeds everything a source carries when a tier takes the source whole', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }] } } }]);

    expect(collectIds(selection)).toStrictEqual(['skill:format', 'skill:lint', 'skill:review']);
  });

  // Shadowing settles which copy an artifact resolves from; selection settles which artifacts are in play.
  it('takes an artifact a higher-precedence source shadows, because the named source still carries it', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }] } } }]);

    expect(collectIds(selection)).toContain('skill:review');
  });

  it('expresses all of a source except one artifact', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }], drop: ['review'] } } }]);

    expect(collectIds(selection)).toStrictEqual(['skill:format', 'skill:lint']);
  });

  it('records the origin a selector used, so a wholesale opt-in is distinguishable from a named one', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }] } } }]);

    expect(selection.seeded.at(0)?.seededBy).toStrictEqual([{ via: 'source-catalog', tierId: 'project' }]);
  });

  it('carries one seed per tier when several tiers seed one artifact', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'] } } },
      { id: 'project', select: { skill: { use: ['lint'] } } },
    ]);

    expect(selection.seeded.at(0)?.seededBy).toStrictEqual([
      { via: 'declaration', tierId: 'global' },
      { via: 'declaration', tierId: 'project' },
    ]);
  });

  it('carries one seed when a tier names the same artifact twice', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['lint', 'lint'] } } }]);

    expect(selection.seeded.at(0)?.seededBy).toStrictEqual([{ via: 'declaration', tierId: 'project' }]);
  });

  // Naming an artifact and taking its source whole are two different decisions, so both are recorded.
  it('carries both seeds when a tier names an artifact and also takes its source whole', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['lint', { source: 'acme' }] } } }]);

    expect(selection.seeded.find(({ artifactId }) => artifactId === 'skill:lint')?.seededBy).toStrictEqual([
      { via: 'declaration', tierId: 'project' },
      { via: 'source-catalog', tierId: 'project' },
    ]);
  });

  // What survives the fold is what decided the final state, not every tier that ever mentioned the artifact.
  it('names only the deciding tier after a use, a drop, and a use again', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'] } } },
      { id: 'team', select: { skill: { drop: ['lint'] } } },
      { id: 'project', select: { skill: { use: ['lint'] } } },
    ]);

    expect(selection.seeded).toStrictEqual([
      { artifactId: 'skill:lint', seededBy: [{ via: 'declaration', tierId: 'project' }] },
    ]);
    expect(selection.declined).toStrictEqual([]);
  });

  it('records the tier that dropped an artifact, distinguishing declined from never mentioned', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'] } } },
      { id: 'project', select: { skill: { drop: ['lint'] } } },
    ]);

    expect(selection.declined).toStrictEqual([{ artifactId: 'skill:lint', via: 'declaration', tierId: 'project' }]);
    expect(selection.seeded).toStrictEqual([]);
  });

  it('discards every lower tier’s seeds and declines at a tier declaring reset', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'], drop: ['format'] } } },
      { id: 'project', reset: true, select: { skill: { use: ['format'] } } },
    ]);

    expect(collectIds(selection)).toStrictEqual(['skill:format']);
    expect(selection.declined).toStrictEqual([]);
  });

  it('runs seeded artifacts in id order, so two selections of one shape diff cleanly', () => {
    const selection = select([
      { id: 'project', select: { skill: { use: ['review', 'lint'] }, rulebook: { use: ['house-style'] } } },
    ]);

    expect(collectIds(selection)).toStrictEqual(['rulebook:house-style', 'skill:lint', 'skill:review']);
  });

  it.each([
    ['an artifact no source carries', { skill: { use: ['absent'] } }, 'unknown-artifact'],
    ['a source that is not declared', { skill: { use: [{ source: 'nowhere' }] } }, 'unknown-source'],
    ['a source carrying nothing of the kind', { rulebook: { use: [{ source: 'acme' }] } }, 'empty-source'],
    ['a kind the catalog does not carry', { partial: { use: ['x'] } }, 'unknown-kind'],
  ])('reports %s as a diagnostic rather than a failure', (_label, block, code) => {
    const selection = select([{ id: 'project', select: block }]);

    expect(selection.diagnostics).toHaveLength(1);
    expect(selection.diagnostics.at(0)?.code).toBe(code);
  });

  it('locates a diagnostic at the config entry responsible', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['lint', 'absent'] } } }]);

    expect(selection.diagnostics.at(0)?.at).toStrictEqual({
      tierId: 'project',
      kindId: 'skill',
      list: 'use',
      index: 1,
    });
  });

  it('collects every diagnostic, rather than stopping at the first', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['absent', 'missing'] } } }]);

    expect(selection.diagnostics).toHaveLength(2);
  });

  // Every source in the fixture points at a directory that does not exist, so a filesystem read would fail here.
  it('selects without reading anything from disk', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }] } } }]);

    expect(catalog.sources.map(({ dir }) => dir)).toStrictEqual(['/nonexistent/local', '/nonexistent/acme']);
    expect(collectIds(selection)).toHaveLength(3);
  });
});

// region | Helpers

/** The ids of the artifacts a selection seeded, in the order it runs them. */
function collectIds(selection: Selection): Array<string> {
  return selection.seeded.map(({ artifactId }) => artifactId);
}

/** The selection `tiers` makes from the shared catalog. */
function select(tiers: ReadonlyArray<TierInput>): Selection {
  return selectArtifacts(buildConfig(tiers), catalog);
}

// endregion | Helpers
