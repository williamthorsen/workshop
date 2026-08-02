import { describe, expect, it } from 'vitest';

import { createRequireKnown } from '../createRequireKnown.ts';
import type { Violation } from '../Violation.ts';

describe(createRequireKnown, () => {
  it('if an id names no entry in its table, records the reference and the table it points at', () => {
    const violations: Array<Violation> = [];
    createRequireKnown(violations)(new Set(['team']), 'absent', 'artifacts[0].sourceId', 'sources');

    expect(violations).toStrictEqual([
      { path: 'artifacts[0].sourceId', message: 'references "absent", which is not an entry in sources' },
    ]);
  });

  it('if an id resolves, records nothing', () => {
    const violations: Array<Violation> = [];
    createRequireKnown(violations)(new Set(['team']), 'team', 'artifacts[0].sourceId', 'sources');

    expect(violations).toStrictEqual([]);
  });

  it('if an id is absent, records nothing, so an optional reference needs no guard at its call site', () => {
    const violations: Array<Violation> = [];
    createRequireKnown(violations)(new Set(['team']), undefined, 'artifacts[0].sourceId', 'sources');

    expect(violations).toStrictEqual([]);
  });

  it('appends to the accumulator its traversal owns, in the order the references were checked', () => {
    const violations: Array<Violation> = [];
    const requireKnown = createRequireKnown(violations);
    requireKnown(new Set(), 'first', 'a', 'sources');
    requireKnown(new Set(), 'second', 'b', 'targets');

    expect(violations.map(({ path }) => path)).toStrictEqual(['a', 'b']);
  });
});
