import { describe, expect, it } from 'vitest';

import { buildClosure } from '../../../test-utils/buildClosure.ts';
import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { findMisplacedCycles } from '../findMisplacedCycles.ts';

describe(findMisplacedCycles, () => {
  it('accepts a diagnostic naming no artifacts', () => {
    expect(findMisplacedCycles(buildClosure())).toStrictEqual([]);
  });

  it('accepts a cycle diagnostic naming the artifacts it runs through', () => {
    const closure = buildClosure();
    const diagnostic = requireEntry(closure.diagnostics, 0);
    diagnostic.code = 'dependency-cycle';
    diagnostic.cycle = ['skill:review', 'skill:lint'];

    expect(findMisplacedCycles(closure)).toStrictEqual([]);
  });

  it('if any other diagnostic names artifacts, faults it, its fault running through none of them', () => {
    const closure = buildClosure();
    const diagnostic = requireEntry(closure.diagnostics, 0);
    diagnostic.code = 'misplaced-key';
    diagnostic.cycle = ['skill:review'];

    expect(findMisplacedCycles(closure)).toStrictEqual([
      {
        path: 'diagnostics[0].cycle',
        message: 'is set on a "misplaced-key" diagnostic, and only a dependency cycle runs through artifacts',
      },
    ]);
  });
});
