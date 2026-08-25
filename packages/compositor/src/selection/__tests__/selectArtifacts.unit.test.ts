import { describe, expect, it } from 'vitest';

import { buildCatalogFromSpec } from '../../test-utils/buildCatalogFromSpec.ts';
import { buildConfig, type TierInput } from '../../test-utils/buildConfig.ts';
import { selectArtifacts, type Selection } from '../selectArtifacts.ts';

const catalog = buildCatalogFromSpec({
  kinds: ['rulebook', 'skill'],
  sources: ['local', 'acme'],
  entries: [
    { kindId: 'skill', slug: 'lint', carriedBy: ['acme'] },
    { kindId: 'skill', slug: 'format', carriedBy: ['acme'] },
    // The contested entry: local wins it, and acme contains the shadowed copy.
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

  it('seeds everything a source contains when a tier takes the source whole', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }] } } }]);

    expect(collectIds(selection)).toStrictEqual(['skill:format', 'skill:lint', 'skill:review']);
  });

  it('takes an artifact a higher-precedence source shadows, because the named source still contains it', () => {
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

  it('records one seed per tier when several tiers seed one artifact', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'] } } },
      { id: 'project', select: { skill: { use: ['lint'] } } },
    ]);

    expect(selection.seeded.at(0)?.seededBy).toStrictEqual([
      { via: 'declaration', tierId: 'global' },
      { via: 'declaration', tierId: 'project' },
    ]);
  });

  it('records one seed when a tier names the same artifact twice', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['lint', 'lint'] } } }]);

    expect(selection.seeded.at(0)?.seededBy).toStrictEqual([{ via: 'declaration', tierId: 'project' }]);
  });

  // Naming an artifact and taking its source whole are two different decisions, so both are recorded.
  it('records both seeds when a tier names an artifact and also takes its source whole', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['lint', { source: 'acme' }] } } }]);

    expect(selection.seeded.find(({ artifactId }) => artifactId === 'skill:lint')?.seededBy).toStrictEqual([
      { via: 'declaration', tierId: 'project' },
      { via: 'source-catalog', tierId: 'project' },
    ]);
  });

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

  it('runs declined artifacts in id order, whatever order the tiers dropped them', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint', 'review'] } } },
      { id: 'project', select: { skill: { drop: ['review', 'lint'] } } },
    ]);

    expect(selection.declined.map(({ artifactId }) => artifactId)).toStrictEqual(['skill:lint', 'skill:review']);
  });

  it('discards every lower tier’s seeds and declines at a tier declaring shouldReset', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'], drop: ['format'] } } },
      { id: 'project', shouldReset: true, select: { skill: { use: ['format'] } } },
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

  // A block naming an absent kind faults whole: every entry under it would name the same missing kind.
  it('reports a kind the catalog does not contain as one diagnostic, rather than one per entry', () => {
    const selection = select([{ id: 'project', select: { partial: { use: ['x', 'y'] } } }]);

    expect(selection.diagnostics).toHaveLength(1);
    expect(selection.diagnostics.at(0)?.code).toBe('unknown-kind');
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

  // The fixture declares only `drop`, so naming a list here could only name one the author never wrote.
  it('locates a block-level diagnostic at the block, naming no list or position', () => {
    const selection = select([{ id: 'project', select: { partial: { drop: ['x'] } } }]);

    expect(selection.diagnostics.at(0)?.at).toStrictEqual({ tierId: 'project', kindId: 'partial' });
  });

  it('collects every diagnostic, rather than stopping at the first', () => {
    const selection = select([{ id: 'project', select: { skill: { use: ['absent', 'missing'] } } }]);

    expect(selection.diagnostics).toHaveLength(2);
  });

  it('binds an artifact a tier names under an inlay, seeding it as the binding it is', () => {
    const selection = select([{ id: 'project', inlays: { preferences: { skill: { use: ['lint'] } } } }]);

    expect(selection.bindings).toStrictEqual([{ inlayName: 'preferences', artifactIds: ['skill:lint'] }]);
    expect(selection.seeded).toStrictEqual([
      { artifactId: 'skill:lint', seededBy: [{ via: 'binding', tierId: 'project' }] },
    ]);
  });

  // The origin says the artifact is there to fill an inlay; how the selector reached it is the binding's own business.
  it('seeds a binding as a binding even where the selector took a source whole', () => {
    const selection = select([
      { id: 'project', inlays: { preferences: { rulebook: { use: [{ source: 'local' }] } } } },
    ]);

    expect(selection.seeded.at(0)?.seededBy).toStrictEqual([{ via: 'binding', tierId: 'project' }]);
  });

  it('fills in tier order, then kind order, then the order a use list names', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['review', 'lint'] } } } },
      { id: 'project', inlays: { preferences: { rulebook: { use: ['house-style'] }, skill: { use: ['format'] } } } },
    ]);

    expect(selection.bindings.at(0)?.artifactIds).toStrictEqual([
      'skill:review',
      'skill:lint',
      'rulebook:house-style',
      'skill:format',
    ]);
  });

  // The higher tier says who wants it there, which is not a statement about where it goes.
  it('leaves an artifact’s position alone when a higher tier binds it again', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['lint', 'review'] } } } },
      { id: 'project', inlays: { preferences: { skill: { use: ['lint'] } } } },
    ]);

    expect(selection.bindings.at(0)?.artifactIds).toStrictEqual(['skill:lint', 'skill:review']);
    expect(selection.seeded.find(({ artifactId }) => artifactId === 'skill:lint')?.seededBy).toStrictEqual([
      { via: 'binding', tierId: 'global' },
      { via: 'binding', tierId: 'project' },
    ]);
  });

  it('unbinds from one inlay alone when a higher tier drops there, leaving the artifact bound elsewhere', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['lint'] } }, appendix: { skill: { use: ['lint'] } } } },
      { id: 'project', inlays: { preferences: { skill: { drop: ['lint'] } } } },
    ]);

    expect(selection.bindings).toStrictEqual([{ inlayName: 'appendix', artifactIds: ['skill:lint'] }]);
    expect(collectIds(selection)).toStrictEqual(['skill:lint']);
  });

  it('stops seeding an artifact whose last binding a higher tier dropped', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['lint'] } } } },
      { id: 'project', inlays: { preferences: { skill: { drop: ['lint'] } } } },
    ]);

    expect(selection.bindings).toStrictEqual([]);
    expect(selection.seeded).toStrictEqual([]);
  });

  it('keeps an artifact a binding dropped where something else still selects it', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'] } }, inlays: { preferences: { skill: { use: ['lint'] } } } },
      { id: 'project', inlays: { preferences: { skill: { drop: ['lint'] } } } },
    ]);

    expect(selection.bindings).toStrictEqual([]);
    expect(selection.seeded).toStrictEqual([
      { artifactId: 'skill:lint', seededBy: [{ via: 'declaration', tierId: 'global' }] },
    ]);
  });

  it('unbinds silently when a higher tier’s select drops a bound artifact', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['lint'] } } } },
      { id: 'project', select: { skill: { drop: ['lint'] } } },
    ]);

    expect(selection.bindings).toStrictEqual([]);
    expect(selection.declined).toStrictEqual([{ artifactId: 'skill:lint', via: 'declaration', tierId: 'project' }]);
  });

  // A binding is what binds; re-adopting the artifact says it belongs in the composition, not that it fills anything.
  it('does not restore a binding a select drop cleared when a later tier uses the artifact again', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['lint'] } } } },
      { id: 'team', select: { skill: { drop: ['lint'] } } },
      { id: 'project', select: { skill: { use: ['lint'] } } },
    ]);

    expect(selection.bindings).toStrictEqual([]);
    expect(selection.seeded).toStrictEqual([
      { artifactId: 'skill:lint', seededBy: [{ via: 'declaration', tierId: 'project' }] },
    ]);
  });

  it('binds despite a drop in the same tier’s select, the tier’s bindings applying after it', () => {
    const selection = select([
      { id: 'global', select: { skill: { use: ['lint'] } } },
      { id: 'project', select: { skill: { drop: ['lint'] } }, inlays: { preferences: { skill: { use: ['lint'] } } } },
    ]);

    expect(selection.bindings).toStrictEqual([{ inlayName: 'preferences', artifactIds: ['skill:lint'] }]);
    expect(selection.declined).toStrictEqual([]);
  });

  it('discards every lower tier’s bindings at a tier declaring shouldReset', () => {
    const selection = select([
      { id: 'global', inlays: { preferences: { skill: { use: ['lint'] } } } },
      { id: 'project', shouldReset: true, inlays: { preferences: { skill: { use: ['review'] } } } },
    ]);

    expect(selection.bindings).toStrictEqual([{ inlayName: 'preferences', artifactIds: ['skill:review'] }]);
  });

  it('runs bindings in inlay-name order, so two selections of one shape diff cleanly', () => {
    const selection = select([
      {
        id: 'project',
        inlays: { preferences: { skill: { use: ['lint'] } }, appendix: { skill: { use: ['review'] } } },
      },
    ]);

    expect(selection.bindings.map(({ inlayName }) => inlayName)).toStrictEqual(['appendix', 'preferences']);
  });

  it('locates a diagnostic under a binding at the inlay the author wrote it under', () => {
    const selection = select([{ id: 'project', inlays: { preferences: { skill: { use: ['absent'] } } } }]);

    expect(selection.diagnostics.at(0)?.code).toBe('unknown-artifact');
    expect(selection.diagnostics.at(0)?.at).toStrictEqual({
      tierId: 'project',
      kindId: 'skill',
      inlayName: 'preferences',
      list: 'use',
      index: 0,
    });
  });

  // Asserting the dirs is what keeps the claim honest: a source pointing somewhere real would let this pass by accident.
  it('selects without reading anything from disk', () => {
    const selection = select([{ id: 'project', select: { skill: { use: [{ source: 'acme' }] } } }]);

    expect(catalog.sources.map(({ dir }) => dir)).toStrictEqual(['/nonexistent/local', '/nonexistent/acme']);
    expect(collectIds(selection)).toHaveLength(3);
  });
});

// region | Helpers

/** Collects the ids of the artifacts a selection seeded, in the order it runs them. */
function collectIds(selection: Selection): Array<string> {
  return selection.seeded.map(({ artifactId }) => artifactId);
}

/** Selects from the shared catalog using `tiers`. */
function select(tiers: ReadonlyArray<TierInput>): Selection {
  return selectArtifacts(buildConfig(tiers), catalog);
}

// endregion | Helpers
