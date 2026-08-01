import { describe, expect, it } from 'vitest';

import { ArtifactEntrySchema, DependencyEdgeSchema, type EdgeOrigin, PartialEntrySchema } from '../graphSchemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const winner = { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'h1' };
const resolution = { winner, shadowed: [] };
const present = {
  id: 'skill:review',
  kindId: 'skill',
  slug: 'review',
  status: 'changed',
  seededBy: ['declaration'],
  dependsOn: [],
  resolution,
};
const removed = { id: 'skill:retired', kindId: 'skill', slug: 'retired', status: 'removed' };

const edgeOrigins: ReadonlyArray<EdgeOrigin> = ['declared', 'enumerated', 'injected', 'member', 'token'];

describe('ArtifactEntrySchema', () => {
  it('accepts a present artifact carrying its resolution and edges', () => {
    expect(ArtifactEntrySchema.parse(present)).toStrictEqual(present);
  });

  it('accepts a removed artifact that no longer resolves from any source', () => {
    expect(ArtifactEntrySchema.parse(removed)).toStrictEqual(removed);
  });

  it('accepts a removed artifact that still resolves, keeping its resolution and edges', () => {
    const stillResolvable = { ...removed, dependsOn: [{ to: 'skill:other', via: 'declared' }], resolution };

    expect(ArtifactEntrySchema.parse(stillResolvable)).toStrictEqual(stillResolvable);
  });

  it('if a present artifact omits its resolution, rejects it for that field', () => {
    const { resolution: _dropped, ...withoutResolution } = present;

    expect(findIssuePaths(ArtifactEntrySchema, withoutResolution)).toStrictEqual([['resolution']]);
  });

  it('if a present artifact is seeded by nothing, treats it as reached only through a dependency', () => {
    const pureDependency = { ...present, seededBy: [] };

    expect(ArtifactEntrySchema.parse(pureDependency)).toStrictEqual(pureDependency);
  });

  it('if the status is outside the known set, rejects the artifact', () => {
    expect(findIssuePaths(ArtifactEntrySchema, { ...present, status: 'moved' })).toStrictEqual([['status']]);
  });

  it('records every shadowed candidate in the order given', () => {
    const shadowed = [
      { sourceId: 'shared', path: 'skills/review/SKILL.md', hash: 'h2' },
      { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'h3' },
    ];

    const parsed = ArtifactEntrySchema.parse({ ...present, resolution: { winner, shadowed } });

    expect(parsed).toHaveProperty('resolution.shadowed', shadowed);
  });
});

describe('DependencyEdgeSchema', () => {
  it.each(edgeOrigins)('accepts an edge contributed by a %s origin', (via) => {
    expect(DependencyEdgeSchema.parse({ to: 'skill:other', via })).toStrictEqual({ to: 'skill:other', via });
  });

  it('accepts a token edge naming the partial the token was read from', () => {
    const throughPartial = { to: 'skill:other', via: 'token', partialId: 'team:_data/shared.md' };

    expect(DependencyEdgeSchema.parse(throughPartial)).toStrictEqual(throughPartial);
  });

  it('if the origin is outside the known set, rejects the edge for that field', () => {
    expect(findIssuePaths(DependencyEdgeSchema, { to: 'skill:other', via: 'inferred' })).toStrictEqual([['via']]);
  });
});

describe('PartialEntrySchema', () => {
  it('accepts a partial addressed by path within its own source', () => {
    const partial = { id: 'team:_data/shared.md', sourceId: 'team', path: '_data/shared.md', hash: 'h4' };

    expect(PartialEntrySchema.parse(partial)).toStrictEqual(partial);
  });
});
