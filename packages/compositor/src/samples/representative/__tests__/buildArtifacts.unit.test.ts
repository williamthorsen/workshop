import { describe, expect, it } from 'vitest';

import { resolveInclusionPaths } from '../../../graph/traversal.ts';
import type { ArtifactEntry } from '../../../schemas/graph-schemas.ts';
import { buildArtifacts } from '../buildArtifacts.ts';

const artifacts = buildArtifacts();

describe(buildArtifacts, () => {
  it('reaches one artifact by three routes, two of them from the same seed', () => {
    expect(resolveInclusionPaths({ artifacts }, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
      ['collection:core', 'skill:lint'],
      ['subagent:auditor', 'skill:review', 'skill:lint'],
    ]);
  });

  it('records two losing candidates for an artifact three sources contain', () => {
    expect(findArtifact('skill:review').resolution?.shadowed.map((candidate) => candidate.sourceId)).toStrictEqual([
      'packaged',
      'library',
    ]);
  });

  it('lets the lowest-precedence source win where no other source contains the artifact', () => {
    expect(findArtifact('skill:lint').resolution?.winner.sourceId).toBe('library');
  });

  it('records an artifact that is no longer part of the closure', () => {
    expect(findArtifact('skill:retired').status).toBe('removed');
  });
});

// region | Helpers

/** Finds the artifact with the given id, failing the test when the table contains none. */
function findArtifact(id: string): ArtifactEntry {
  const artifact = artifacts.find((entry) => entry.id === id);
  if (artifact === undefined) {
    throw new Error(`The representative sample has no artifact "${id}".`);
  }
  return artifact;
}

// endregion | Helpers
