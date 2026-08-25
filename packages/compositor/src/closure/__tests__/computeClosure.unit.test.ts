import { describe, expect, it } from 'vitest';

import { buildDependentsIndex, resolveInclusionPaths } from '../../graph/traversal.ts';
import { ClosureSchema } from '../../schemas/closure-schemas.ts';
import type { TierDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { DependencyEdge, PartialEntry } from '../../schemas/graph-schemas.ts';
import type { ArtifactId } from '../../schemas/scalar-schemas.ts';
import { buildCatalogFromSpec } from '../../test-utils/buildCatalogFromSpec.ts';
import { assertClosureIsConsistent } from '../assertClosureIsConsistent.ts';
import { computeClosure, type SeedView } from '../computeClosure.ts';
import type { EdgeGraph } from '../EdgeGraph.ts';

const tiers: ReadonlyArray<TierDescriptor> = [{ id: 'project', label: 'Project' }];

const catalog = buildCatalogFromSpec({
  traversalOnlyKinds: ['collection'],
  sources: ['team', 'library'],
  entries: [
    { kindId: 'collection', slug: 'core', carriedBy: ['team'] },
    { kindId: 'skill', slug: 'review', carriedBy: ['team', 'library'] },
    { kindId: 'skill', slug: 'lint', carriedBy: ['library'] },
    { kindId: 'skill', slug: 'unused', carriedBy: ['library'] },
  ],
});

describe(computeClosure, () => {
  it('follows dependency edges transitively from the seeds', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(closure.artifacts.map(({ id }) => id)).toStrictEqual(['collection:core', 'skill:lint', 'skill:review']);
  });

  it('keeps an expanded aggregate, so the route explaining a member stays renderable', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(resolveInclusionPaths(closure, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
      ['collection:core', 'skill:lint'],
    ]);
  });

  it('keeps every route to a diamond, and gives the reverse direction through the shared helpers', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(buildDependentsIndex(closure)('skill:lint')).toStrictEqual(['collection:core', 'skill:review']);
  });

  it('leaves out an artifact nothing reaches', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(closure.artifacts.map(({ id }) => id)).not.toContain('skill:unused');
  });

  it('records the tiers that decided each seed, so an inherited opt-in is told from a project one', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(closure.artifacts.find(({ id }) => id === 'collection:core')?.seededBy).toStrictEqual([
      { via: 'declaration', tierId: 'project' },
    ]);
  });

  it('reads no files, so recomputing over a changed config is free', () => {
    const graph = buildGraph();

    expect(computeClosure({ graph, selection: seedsFor(['skill:lint']), tiers }).artifacts).toHaveLength(1);
    expect(computeClosure({ graph, selection: seedsFor(['collection:core']), tiers }).artifacts).toHaveLength(3);
  });

  it('satisfies its own consistency assertion, so what the engine produces needs no repair', () => {
    expect(() => assertClosureIsConsistent(computeClosure(inputFor(['collection:core'])))).not.toThrow();
  });

  it('parses against the schema, so the walk cannot produce a shape the contract rejects', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(ClosureSchema.parse(closure)).toStrictEqual(closure);
  });

  it('has no on-disk layout or resolved directory, neither meaning anything to a reader of a closure', () => {
    const closure = computeClosure(inputFor(['collection:core']));

    expect(closure.kinds[0]).not.toHaveProperty('layout');
    expect(closure.sources[0]).not.toHaveProperty('dir');
  });

  it('contains the partials its surviving token edges name, and no others', () => {
    const partials: ReadonlyArray<PartialEntry> = [
      { id: 'team:_data/shared.md', sourceId: 'team', path: '_data/shared.md', hash: 'hash:shared' },
      { id: 'team:_data/spare.md', sourceId: 'team', path: '_data/spare.md', hash: 'hash:spare' },
    ];
    const graph = buildGraph({
      edges: [['collection:core', [{ to: 'skill:lint', via: 'token', partialId: 'team:_data/shared.md' }]]],
      partials,
    });

    const closure = computeClosure({ graph, selection: seedsFor(['collection:core']), tiers });
    expect(closure.partials.map(({ id }) => id)).toStrictEqual(['team:_data/shared.md']);
  });

  describe('when an edge names an artifact no source contains', () => {
    const graph = buildGraph({ edges: [['collection:core', [{ to: 'skill:absent', via: 'declared' }]]] });
    const closure = computeClosure({ graph, selection: seedsFor(['collection:core']), tiers });

    it('reports a diagnostic naming the artifact responsible', () => {
      expect(closure.diagnostics).toStrictEqual([
        {
          code: 'unknown-reference',
          message: 'collection:core names "skill:absent" as a dependency, which no source contains.',
          at: { artifactId: 'collection:core' },
        },
      ]);
    });

    it('drops the edge rather than leaving a reference nothing resolves', () => {
      expect(closure.artifacts.find(({ id }) => id === 'collection:core')?.dependsOn).toStrictEqual([]);
      expect(() => assertClosureIsConsistent(closure)).not.toThrow();
    });
  });

  describe('when the edges close a cycle', () => {
    const graph = buildGraph({
      edges: [
        ['collection:core', [{ to: 'skill:review', via: 'member' }]],
        ['skill:review', [{ to: 'skill:lint', via: 'declared' }]],
        ['skill:lint', [{ to: 'skill:review', via: 'declared' }]],
      ],
    });
    const closure = computeClosure({ graph, selection: seedsFor(['collection:core']), tiers });

    it('reports the cycle once, naming the artifacts it runs through', () => {
      expect(closure.diagnostics).toStrictEqual([
        {
          code: 'dependency-cycle',
          message: 'skill:review -> skill:lint -> skill:review is a dependency cycle.',
          at: { artifactId: 'skill:lint' },
          cycle: ['skill:review', 'skill:lint'],
        },
      ]);
    });

    it('reaches everything the cycle does not hide, rather than half-populating the result', () => {
      expect(closure.artifacts.map(({ id }) => id)).toStrictEqual(['collection:core', 'skill:lint', 'skill:review']);
    });

    it('keeps the closing edge, which is the fact the diagnostic reports', () => {
      expect(closure.artifacts.find(({ id }) => id === 'skill:lint')?.dependsOn).toStrictEqual([
        { to: 'skill:review', via: 'declared' },
      ]);
    });
  });

  it('reports an artifact that depends on itself as the one-artifact cycle it is', () => {
    const graph = buildGraph({ edges: [['skill:review', [{ to: 'skill:review', via: 'declared' }]]] });
    const closure = computeClosure({ graph, selection: seedsFor(['skill:review']), tiers });

    expect(closure.diagnostics).toStrictEqual([
      {
        code: 'dependency-cycle',
        message: 'skill:review -> skill:review is a dependency cycle.',
        at: { artifactId: 'skill:review' },
        cycle: ['skill:review'],
      },
    ]);
    expect(closure.artifacts.map(({ id }) => id)).toStrictEqual(['skill:review']);
  });

  it('reports one cycle once however many seeds reach it', () => {
    const graph = buildGraph({
      edges: [
        ['skill:review', [{ to: 'skill:lint', via: 'declared' }]],
        ['skill:lint', [{ to: 'skill:review', via: 'declared' }]],
      ],
    });
    const closure = computeClosure({ graph, selection: seedsFor(['skill:review', 'skill:lint']), tiers });

    expect(closure.diagnostics).toHaveLength(1);
  });

  it('records a read fault for an artifact it reached, and drops one for an artifact it did not', () => {
    const graph = buildGraph({
      diagnostics: [
        { code: 'misplaced-key', message: 'reached', at: { artifactId: 'collection:core' } },
        { code: 'misplaced-key', message: 'unreached', at: { artifactId: 'skill:unused' } },
      ],
    });
    const closure = computeClosure({ graph, selection: seedsFor(['collection:core']), tiers });

    expect(closure.diagnostics.map(({ message }) => message)).toStrictEqual(['reached']);
  });

  it('if a seed names an artifact the catalog does not contain, fails the call', () => {
    expect(() => computeClosure(inputFor(['skill:absent']))).toThrow(/skill:absent/);
  });
});

// region | Helpers

/** Builds a graph over the shared catalog, defaulting to the aggregate-and-diamond edge set. */
function buildGraph(
  overrides: {
    edges?: ReadonlyArray<[ArtifactId, ReadonlyArray<DependencyEdge>]>;
    partials?: ReadonlyArray<PartialEntry>;
    diagnostics?: EdgeGraph['diagnostics'];
  } = {},
): EdgeGraph {
  const edges = overrides.edges ?? [
    [
      'collection:core',
      [
        { to: 'skill:review', via: 'member' },
        { to: 'skill:lint', via: 'member' },
      ],
    ],
    ['skill:review', [{ to: 'skill:lint', via: 'declared' }]],
  ];
  return {
    catalog,
    edges: new Map(edges),
    partials: overrides.partials ?? [],
    diagnostics: overrides.diagnostics ?? [],
  };
}

/** Builds the whole input for one closure over the default graph. */
function inputFor(seeded: ReadonlyArray<ArtifactId>): Parameters<typeof computeClosure>[0] {
  return { graph: buildGraph(), selection: seedsFor(seeded), tiers };
}

/** Seeds each id from the project tier, which is what a selection over a one-tier config yields. */
function seedsFor(seeded: ReadonlyArray<ArtifactId>): SeedView {
  return {
    seeded: seeded.map((artifactId) => ({ artifactId, seededBy: [{ via: 'declaration', tierId: 'project' }] })),
  };
}

// endregion | Helpers
