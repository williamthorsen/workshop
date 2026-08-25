import { describe, expect, it } from 'vitest';

import type { EntryOutcome, OverlayMode } from '../../modes/types.ts';
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

  it('prefixes every verify label with "would " so a consumer can detect a read-only run', () => {
    const outcomes: EntryOutcome[] = ['created', 'deleted', 'forced', 'conflict'];

    expect(outcomes.every((outcome) => describeOutcome(outcome, 'verify').startsWith('would '))).toBe(true);
  });

  it('prefixes no applied label with "would "', () => {
    const applied: OverlayMode[] = ['create', 'force'];
    const outcomes: EntryOutcome[] = ['created', 'deleted', 'forced', 'conflict'];

    const labels = applied.flatMap((mode) => outcomes.map((outcome) => describeOutcome(outcome, mode)));

    expect(labels.some((label) => label.startsWith('would '))).toBe(false);
  });
});
