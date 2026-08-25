import { describe, expect, it } from 'vitest';

import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { buildCatalog } from '../../test-utils/buildCatalog.ts';
import { findRepeatedCandidateSources } from '../findRepeatedCandidateSources.ts';

describe(findRepeatedCandidateSources, () => {
  it('accepts a catalog whose every entry names each source at most once', () => {
    expect(findRepeatedCandidateSources(buildCatalog())).toStrictEqual([]);
  });

  it('if a shadowed candidate repeats the winner, names the source that already carries the artifact', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'local', path: 'skills/review/SKILL.md', hash: 'hash:review-again' },
    ];

    expect(findRepeatedCandidateSources(catalog)).toStrictEqual([
      {
        path: 'entries[2].resolution.shadowed[0].sourceId',
        message: 'repeats "local", which already contains this artifact',
      },
    ]);
  });

  it('if two shadowed candidates name one source, reports the second of the pair', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team' },
      { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team-again' },
    ];

    expect(findRepeatedCandidateSources(catalog)).toStrictEqual([
      {
        path: 'entries[2].resolution.shadowed[1].sourceId',
        message: 'repeats "team", which already contains this artifact',
      },
    ]);
  });
});
