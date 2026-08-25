import { describe, expect, it } from 'vitest';

import { ArtifactResolutionSchema, ResolutionCandidateSchema } from '../artifact-resolution-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const winner = { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'h1' };

describe('ResolutionCandidateSchema', () => {
  it('accepts a candidate naming the source, path, and digest it was read from', () => {
    expect(ResolutionCandidateSchema.parse(winner)).toStrictEqual(winner);
  });

  it('if the candidate names no source, rejects it for that field', () => {
    const { sourceId: _dropped, ...withoutSource } = winner;

    expect(findIssuePaths(ResolutionCandidateSchema, withoutSource)).toStrictEqual([['sourceId']]);
  });
});

describe('ArtifactResolutionSchema', () => {
  it('reads an artifact exactly one source contains as shadowing nothing', () => {
    const resolution = { winner, shadowed: [] };

    expect(ArtifactResolutionSchema.parse(resolution)).toStrictEqual(resolution);
  });

  it('records every shadowed candidate in the order given', () => {
    const shadowed = [
      { sourceId: 'shared', path: 'skills/review/SKILL.md', hash: 'h2' },
      { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'h3' },
    ];

    expect(ArtifactResolutionSchema.parse({ winner, shadowed })).toHaveProperty('shadowed', shadowed);
  });

  it('if the resolution names no winner, rejects it for that field', () => {
    expect(findIssuePaths(ArtifactResolutionSchema, { shadowed: [] })).toStrictEqual([['winner']]);
  });
});
