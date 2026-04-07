import { describe, expect, it } from 'vitest';

import type { RdyKit } from '../src/types.ts';
import { validateKit } from '../src/validateKit.ts';

/** Build a minimal valid kit for testing. */
function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'a', checks: [{ name: 'check-a', check: () => true }] },
      { name: 'b', checks: [{ name: 'check-b', check: () => true }] },
    ],
    ...overrides,
  };
}

describe(validateKit, () => {
  it('passes when kit has no suites', () => {
    expect(() => validateKit(makeKit())).not.toThrow();
  });

  it('passes when suites reference valid checklist names', () => {
    const kit = makeKit({ suites: { s: ['a', 'b'] } });

    expect(() => validateKit(kit)).not.toThrow();
  });

  it('throws when a suite name collides with a checklist name', () => {
    const kit = makeKit({ suites: { a: ['b'] } });

    expect(() => validateKit(kit)).toThrow('Suite name(s) collide with checklist name(s): a');
  });

  it('throws when multiple suite names collide with checklist names', () => {
    const kit = makeKit({ suites: { a: ['b'], b: ['a'] } });

    expect(() => validateKit(kit)).toThrow(/a, b/);
  });

  it('throws when a suite references an unknown checklist', () => {
    const kit = makeKit({ suites: { s: ['missing'] } });

    expect(() => validateKit(kit)).toThrow('suite "s" references unknown checklist "missing"');
  });

  it('throws when multiple suites reference unknown checklists', () => {
    const kit = makeKit({ suites: { s1: ['missing'], s2: ['also-missing'] } });

    expect(() => validateKit(kit)).toThrow(/missing.*also-missing/);
  });

  it('includes available checklists in the error message for unknown references', () => {
    const kit = makeKit({ suites: { s: ['missing'] } });

    expect(() => validateKit(kit)).toThrow('Available checklists: a, b');
  });

  it('passes when suites is an empty record', () => {
    const kit = makeKit({ suites: {} });

    expect(() => validateKit(kit)).not.toThrow();
  });

  it('passes when a suite has an empty checklist array', () => {
    const kit = makeKit({ suites: { s: [] } });

    expect(() => validateKit(kit)).not.toThrow();
  });

  it('passes when a suite contains duplicate entries', () => {
    const kit = makeKit({ suites: { s: ['a', 'a'] } });

    expect(() => validateKit(kit)).not.toThrow();
  });
});
