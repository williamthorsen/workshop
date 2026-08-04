import { describe, expect, it } from 'vitest';

import { buildClosure } from '../../../test-utils/buildClosure.ts';
import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { findDanglingReferences } from '../findDanglingReferences.ts';

describe(findDanglingReferences, () => {
  it('accepts a closure whose every reference resolves', () => {
    expect(findDanglingReferences(buildClosure())).toStrictEqual([]);
  });

  it('if a diagnostic is attached to an artifact the closure dropped, locates the dangling reference', () => {
    const closure = buildClosure();
    requireEntry(closure.diagnostics, 0).at = { artifactId: 'skill:absent' };

    expect(findDanglingReferences(closure)).toStrictEqual([
      {
        path: 'diagnostics[0].at.artifactId',
        message: 'references "skill:absent", which is not an entry in artifacts',
      },
    ]);
  });

  it('if a cycle names an artifact the closure dropped, locates the dangling reference', () => {
    const closure = buildClosure();
    const diagnostic = requireEntry(closure.diagnostics, 0);
    diagnostic.code = 'dependency-cycle';
    diagnostic.cycle = ['skill:review', 'skill:absent'];

    expect(findDanglingReferences(closure)).toStrictEqual([
      { path: 'diagnostics[0].cycle[1]', message: 'references "skill:absent", which is not an entry in artifacts' },
    ]);
  });

  it('reports the graph references before the diagnostics, which is the order the payload runs in', () => {
    const closure = buildClosure();
    closure.kinds = [];
    requireEntry(closure.diagnostics, 0).at = { artifactId: 'skill:absent' };

    expect(findDanglingReferences(closure).map(({ path }) => path)).toStrictEqual([
      'artifacts[0].kindId',
      'artifacts[1].kindId',
      'artifacts[2].kindId',
      'diagnostics[0].at.artifactId',
    ]);
  });
});
