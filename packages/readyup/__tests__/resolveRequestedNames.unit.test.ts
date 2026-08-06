import { describe, expect, it } from 'vitest';

import { resolveRequestedNames } from '../src/resolveRequestedNames.ts';
import { captureError } from '../src/test-utils/captureError.ts';
import type { RdyKit } from '../src/types.ts';

/** Build a minimal kit with named checklists and optional suites. */
function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'deploy', checks: [{ name: 'a', check: () => true }] },
      { name: 'infra', checks: [{ name: 'b', check: () => true }] },
      { name: 'lint', checks: [{ name: 'c', check: () => true }] },
    ],
    ...overrides,
  };
}

describe(resolveRequestedNames, () => {
  it('returns all checklist names when no names are requested', () => {
    const result = resolveRequestedNames([], makeKit());

    expect(result).toStrictEqual(['deploy', 'infra', 'lint']);
  });

  it('returns a single checklist name when requested', () => {
    const result = resolveRequestedNames(['deploy'], makeKit());

    expect(result).toStrictEqual(['deploy']);
  });

  it('preserves requested order for checklist names', () => {
    const result = resolveRequestedNames(['lint', 'deploy'], makeKit());

    expect(result).toStrictEqual(['lint', 'deploy']);
  });

  it('expands a suite name to its constituent checklists in suite-defined order', () => {
    const kit = makeKit({ suites: { ci: ['infra', 'deploy'] } });
    const result = resolveRequestedNames(['ci'], kit);

    expect(result).toStrictEqual(['infra', 'deploy']);
  });

  it('combines suite expansion with individual checklist names', () => {
    const kit = makeKit({ suites: { ci: ['deploy'] } });
    const result = resolveRequestedNames(['ci', 'lint'], kit);

    expect(result).toStrictEqual(['deploy', 'lint']);
  });

  it('deduplicates by first occurrence across suites', () => {
    const kit = makeKit({
      suites: { ci: ['deploy', 'infra'], cd: ['infra', 'lint'] },
    });
    const result = resolveRequestedNames(['ci', 'cd'], kit);

    expect(result).toStrictEqual(['deploy', 'infra', 'lint']);
  });

  it('deduplicates when explicit name overlaps with suite', () => {
    const kit = makeKit({ suites: { ci: ['deploy', 'infra'] } });
    const result = resolveRequestedNames(['deploy', 'ci'], kit);

    expect(result).toStrictEqual(['deploy', 'infra']);
  });

  it('throws on unknown names with available checklists listed', () => {
    expect(() => resolveRequestedNames(['missing'], makeKit())).toThrow(
      'Unknown name(s): missing. Checklists: deploy, infra, lint',
    );
  });

  it('includes suite names in the error for unknown names', () => {
    const kit = makeKit({ suites: { ci: ['deploy'] } });

    expect(() => resolveRequestedNames(['missing'], kit)).toThrow('Suites: ci');
  });

  it('throws when multiple names are unknown', () => {
    expect(() => resolveRequestedNames(['x', 'y'], makeKit())).toThrow('Unknown name(s): x, y');
  });

  it('does not list suites in error when kit has no suites', async () => {
    const error = await captureError(() => resolveRequestedNames(['missing'], makeKit()));

    expect(error.message).not.toContain('Suites');
  });

  it('treats a name matching an Object.prototype member as unknown', () => {
    const kit = makeKit({ suites: { ci: ['deploy'] } });

    expect(() => resolveRequestedNames(['valueOf'], kit)).toThrow('Unknown name(s): valueOf');
    expect(() => resolveRequestedNames(['toString'], kit)).toThrow('Unknown name(s): toString');
  });
});
