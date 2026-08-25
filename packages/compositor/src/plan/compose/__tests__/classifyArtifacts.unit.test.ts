import { describe, expect, it } from 'vitest';

import type { ArtifactResolution } from '../../../schemas/artifact-resolution-schemas.ts';
import type { ClosureArtifact } from '../../../schemas/closure-schemas.ts';
import type { ArtifactEntry, DependencyEdge } from '../../../schemas/graph-schemas.ts';
import type { ArtifactId } from '../../../schemas/scalar-schemas.ts';
import type { ClassifyArtifactsInput } from '../classifyArtifacts.ts';
import { classifyArtifacts } from '../classifyArtifacts.ts';
import type { ContentVerdict } from '../TargetPlanContext.ts';

const reviewResolution: ArtifactResolution = {
  winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'sha256:review' },
  shadowed: [],
};

describe(classifyArtifacts, () => {
  it('reads an artifact added at every destination it owns as added', () => {
    const table = classify({ verdicts: new Map([['skill:review', ['added', 'added']]]) });

    expect(statusOf(table, 'skill:review')).toBe('added');
  });

  it('reads an artifact unchanged at every destination it owns as unchanged', () => {
    const table = classify({ verdicts: new Map([['skill:review', ['unchanged', 'unchanged']]]) });

    expect(statusOf(table, 'skill:review')).toBe('unchanged');
  });

  it('reads an artifact added at one destination and unchanged at another as changed', () => {
    const table = classify({ verdicts: new Map([['skill:review', ['added', 'unchanged']]]) });

    expect(statusOf(table, 'skill:review')).toBe('changed');
  });

  it('reads an artifact that deploys nowhere as unchanged, nothing recording where it previously stood', () => {
    const table = classify({ verdicts: new Map() });

    expect(statusOf(table, 'collection:core')).toBe('unchanged');
  });

  it('describes a departing artifact by the kind and slug its claim recovered', () => {
    const table = classify({ departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }] });

    expect(table.find(({ id }) => id === 'skill:retired')).toMatchObject({
      id: 'skill:retired',
      kindId: 'skill',
      slug: 'retired',
      status: 'removed',
    });
  });

  it('keeps a departing artifact’s resolution where a source still holds it', () => {
    const table = classify({
      departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }],
      resolutions: new Map([['skill:retired', reviewResolution]]),
    });

    expect(table.find(({ id }) => id === 'skill:retired')).toHaveProperty('resolution', reviewResolution);
  });

  it('leaves a departing artifact’s resolution out once no source contains it', () => {
    const table = classify({ departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }] });

    expect(table.find(({ id }) => id === 'skill:retired')).not.toHaveProperty('resolution');
  });

  it('keeps a departing artifact’s edge that points at something the table contains', () => {
    const table = classify({
      departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }],
      edges: new Map<ArtifactId, ReadonlyArray<DependencyEdge>>([
        ['skill:retired', [{ to: 'skill:review', via: 'declared' }]],
      ]),
    });

    expect(table.find(({ id }) => id === 'skill:retired')).toHaveProperty('dependsOn', [
      { to: 'skill:review', via: 'declared' },
    ]);
  });

  it('drops a departing artifact’s edge pointing at something no table resolves', () => {
    const table = classify({
      departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }],
      edges: new Map<ArtifactId, ReadonlyArray<DependencyEdge>>([
        ['skill:retired', [{ to: 'skill:gone', via: 'declared' }]],
      ]),
    });

    expect(table.find(({ id }) => id === 'skill:retired')).toHaveProperty('dependsOn', []);
  });

  it('drops a departing artifact’s token edge naming a partial the plan does not contain', () => {
    const table = classify({
      departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }],
      edges: new Map<ArtifactId, ReadonlyArray<DependencyEdge>>([
        ['skill:retired', [{ to: 'skill:review', via: 'token', partialId: 'team:_data/gone.md' }]],
      ]),
    });

    expect(table.find(({ id }) => id === 'skill:retired')).toHaveProperty('dependsOn', []);
  });

  it('runs the whole table lexicographically by id, present and departing alike', () => {
    const table = classify({ departed: [{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }] });

    expect(table.map(({ id }) => id)).toStrictEqual(['collection:core', 'skill:retired', 'skill:review']);
  });
});

// region | Helpers

/** The artifacts a closure reached: one that deploys files, and one whose kind emits none. */
function buildClosureArtifacts(): Array<ClosureArtifact> {
  return [
    {
      id: 'collection:core',
      kindId: 'collection',
      slug: 'core',
      seededBy: [{ via: 'declaration', tierId: 'project' }],
      dependsOn: [{ to: 'skill:review', via: 'member' }],
      resolution: {
        winner: { sourceId: 'team', path: 'collections/core.md', hash: 'sha256:core' },
        shadowed: [],
      },
    },
    {
      id: 'skill:review',
      kindId: 'skill',
      slug: 'review',
      seededBy: [],
      dependsOn: [],
      resolution: reviewResolution,
    },
  ];
}

/** Classifies the fixture's artifacts, overriding whichever part of the input a test varies. */
function classify(overrides: Partial<ClassifyArtifactsInput> = {}): Array<ArtifactEntry> {
  return classifyArtifacts({
    artifacts: buildClosureArtifacts(),
    verdicts: new Map<ArtifactId, ReadonlyArray<ContentVerdict>>(),
    departed: [],
    resolutions: new Map(),
    edges: new Map(),
    partialIds: new Set(),
    ...overrides,
  });
}

/** Reads one artifact's status out of a classified table. */
function statusOf(table: ReadonlyArray<ArtifactEntry>, id: ArtifactId): string | undefined {
  return table.find((artifact) => artifact.id === id)?.status;
}

// endregion | Helpers
