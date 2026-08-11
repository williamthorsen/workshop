import { describe, expect, it } from 'vitest';

import type { Severity } from '../../kits/types.ts';
import { meetsThreshold } from '../meetsThreshold.ts';

describe(meetsThreshold, () => {
  it.each([
    { severity: 'error', threshold: 'error', expected: true },
    { severity: 'error', threshold: 'warn', expected: true },
    { severity: 'error', threshold: 'recommend', expected: true },
    { severity: 'warn', threshold: 'error', expected: false },
    { severity: 'warn', threshold: 'warn', expected: true },
    { severity: 'warn', threshold: 'recommend', expected: true },
    { severity: 'recommend', threshold: 'error', expected: false },
    { severity: 'recommend', threshold: 'warn', expected: false },
    { severity: 'recommend', threshold: 'recommend', expected: true },
  ] as const)('returns $expected for severity=$severity, threshold=$threshold', ({ severity, threshold, expected }) => {
    expect(meetsThreshold(severity, threshold)).toBe(expected);
  });

  it('throws on a severity outside the enum', () => {
    expect(() => meetsThreshold(asSeverity('info'), 'error')).toThrow(
      'Unknown severity "info". Expected one of: error, warn, recommend.',
    );
  });

  it('throws on a threshold outside the enum', () => {
    expect(() => meetsThreshold('error', asSeverity('info'))).toThrow('Unknown severity threshold "info"');
  });
});

// region | Helpers

/** Restate a string as a severity, standing in for a kit that declared one outside the enum. */
function asSeverity(value: string): Severity {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the throw path is reachable only from a value the type forbids.
  return value as Severity;
}

// endregion | Helpers
