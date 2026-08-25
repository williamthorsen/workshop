import { describe, expect, it } from 'vitest';

import type { ResolutionCandidate } from '../../schemas/artifact-resolution-schemas.ts';
import { findResolutionOrderViolations } from '../findResolutionOrderViolations.ts';

const sources = [{ id: 'local' }, { id: 'team' }, { id: 'library' }];

describe(findResolutionOrderViolations, () => {
  it('accepts candidates that descend from their winner in precedence order', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('local', ['team', 'library']) }],
      sources,
    );

    expect(violations).toStrictEqual([]);
  });

  it('if a shadowed candidate outranks its winner, blames it on the winner', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('team', ['local']) }],
      sources,
    );

    expect(violations).toStrictEqual([
      {
        path: 'entries[0].resolution.shadowed[0].sourceId',
        message: 'names "local", which does not follow "team" in source precedence order',
      },
    ]);
  });

  it('if candidates ascend rather than descend, locates the one out of order', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('local', ['library', 'team']) }],
      sources,
    );

    expect(violations).toStrictEqual([
      {
        path: 'entries[0].resolution.shadowed[1].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('blames each out-of-order candidate on the source it was actually compared against', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('local', ['library', 'team', 'team']) }],
      sources,
    );

    expect(violations.map(({ path }) => path)).toStrictEqual([
      'entries[0].resolution.shadowed[1].sourceId',
      'entries[0].resolution.shadowed[2].sourceId',
    ]);
  });

  it('if a candidate names an unknown source, skips it, leaving the dangling reference to its caller', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('local', ['absent']) }],
      sources,
    );

    expect(violations).toStrictEqual([]);
  });

  it('if the winner names an unknown source, skips the whole resolution rather than blaming its candidates', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('absent', ['local']) }],
      sources,
    );

    expect(violations).toStrictEqual([]);
  });

  it('ranks a repeated source id at its first occurrence, which is the one that would win resolution', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: buildResolution('local', ['team']) }],
      [{ id: 'local' }, { id: 'team' }, { id: 'local' }],
    );

    expect(violations).toStrictEqual([]);
  });

  it('if an entry has no resolution, skips it', () => {
    const violations = findResolutionOrderViolations(
      [{ basePath: 'entries[0].resolution', resolution: undefined }],
      sources,
    );

    expect(violations).toStrictEqual([]);
  });
});

// region | Helpers

/** Builds a resolution won by `winner` over `shadowed`, each candidate with the path and hash the rule ignores. */
function buildResolution(
  winner: string,
  shadowed: ReadonlyArray<string>,
): { winner: ResolutionCandidate; shadowed: Array<ResolutionCandidate> } {
  return { winner: buildCandidate(winner), shadowed: shadowed.map(buildCandidate) };
}

/** Builds a candidate `sourceId` contains. */
function buildCandidate(sourceId: string): ResolutionCandidate {
  return { sourceId, path: 'skills/review/SKILL.md', hash: `hash:review-${sourceId}` };
}

// endregion | Helpers
