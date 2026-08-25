import { describe, expect, it } from 'vitest';

import type { EntryOutcome } from '../../modes/types.ts';
import { describeOutcome } from '../describeOutcome.ts';

describe(describeOutcome, () => {
  it.each<[EntryOutcome, string]>([
    ['created', 'would create'],
    ['deleted', 'would delete'],
    ['forced', 'would overwrite'],
    ['conflict', 'would conflict'],
  ])('phrases %s as a preview under verify', (outcome, label) => {
    expect(describeOutcome(outcome, 'verify')).toBe(label);
  });

  it.each<[EntryOutcome, string]>([
    ['created', 'created'],
    ['deleted', 'deleted'],
    ['forced', 'overwritten'],
    ['conflict', 'conflict'],
  ])('phrases %s as a resulting state under create and force', (outcome, label) => {
    expect(describeOutcome(outcome, 'create')).toBe(label);
    expect(describeOutcome(outcome, 'force')).toBe(label);
  });
});
