import { describe, expect, it } from 'vitest';

import type { OutcomeMap } from '../entry-outcomes.ts';
import { countOutcome, partitionStatus } from '../entry-outcomes.ts';
import type { OverlayEntry } from '../types.ts';

const OUTCOMES: OutcomeMap = { A: 'created', D: 'deleted', M: 'conflict' };

describe(partitionStatus, () => {
  it('assigns each row the outcome its code maps to', () => {
    const result = partitionStatus(
      [
        { path: '.new', code: 'A' },
        { path: '.gone', code: 'D' },
        { path: '.diff', code: 'M' },
      ],
      OUTCOMES,
    );

    expect(result.entries).toStrictEqual([
      { path: '.new', outcome: 'created' },
      { path: '.gone', outcome: 'deleted' },
      { path: '.diff', outcome: 'conflict' },
    ]);
  });

  it('drops rows whose code the outcome map omits', () => {
    const result = partitionStatus(
      [
        { path: '.new', code: 'A' },
        { path: '.diff', code: 'M' },
      ],
      { A: 'created' },
    );

    expect(result.entries).toStrictEqual([{ path: '.new', outcome: 'created' }]);
  });

  it('tallies R rows into pendingScriptCount instead of emitting entries', () => {
    const result = partitionStatus(
      [
        { path: 'normalize.sh', code: 'R' },
        { path: 'seed.sh', code: 'R' },
      ],
      OUTCOMES,
    );

    expect(result).toStrictEqual({ entries: [], pendingScriptCount: 2 });
  });

  it('tallies an R row even when the outcome map names R', () => {
    const result = partitionStatus([{ path: 'normalize.sh', code: 'R' }], { ...OUTCOMES, R: 'created' });

    expect(result).toStrictEqual({ entries: [], pendingScriptCount: 1 });
  });

  it('returns no entries and no pending scripts for empty status', () => {
    expect(partitionStatus([], OUTCOMES)).toStrictEqual({ entries: [], pendingScriptCount: 0 });
  });
});

describe(countOutcome, () => {
  it('counts only the entries carrying the given outcome', () => {
    const entries: OverlayEntry[] = [
      { path: '.a', outcome: 'created' },
      { path: '.b', outcome: 'conflict' },
      { path: '.c', outcome: 'created' },
    ];

    expect(countOutcome(entries, 'created')).toBe(2);
  });

  it('returns 0 when no entry carries the given outcome', () => {
    expect(countOutcome([{ path: '.a', outcome: 'created' }], 'forced')).toBe(0);
  });
});
