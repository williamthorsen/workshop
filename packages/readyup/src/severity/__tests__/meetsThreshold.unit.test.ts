import { describe, expect, it } from 'vitest';

import { asSeverity } from '../../test-utils/asSeverity.ts';
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
