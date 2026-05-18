import { describe, expect, it } from 'vitest';

import { compareVersionsForSkew } from '../src/versionSkew/compareVersionsForSkew.ts';

describe(compareVersionsForSkew, () => {
  // Threshold table from the ticket
  it.each([
    ['0.20.0', '0.21.0', 'runner-newer'],
    ['0.20.0', '0.19.0', 'runner-older'],
    ['1.2.0', '2.0.0', 'runner-newer'],
    ['1.2.0', '0.9.0', 'runner-older'],
  ] as const)('reports skew above the leftmost-non-zero boundary: %s vs %s', (compileTime, runtime, direction) => {
    expect(compareVersionsForSkew(compileTime, runtime)).toStrictEqual({ kind: 'skew', direction });
  });

  it.each([
    ['0.20.0', '0.20.5'],
    ['0.20.3', '0.20.0'],
    ['1.2.0', '1.3.0'],
    ['1.5.7', '1.4.0'],
  ])('reports no-skew below the leftmost-non-zero boundary: %s vs %s', (compileTime, runtime) => {
    expect(compareVersionsForSkew(compileTime, runtime)).toStrictEqual({ kind: 'no-skew' });
  });

  it('reports no-skew when versions are identical', () => {
    expect(compareVersionsForSkew('0.20.0', '0.20.0')).toStrictEqual({ kind: 'no-skew' });
  });

  it('reports no-skew when compile-time version is all-zero (no leftmost non-zero segment)', () => {
    expect(compareVersionsForSkew('0.0.0', '0.0.1')).toStrictEqual({ kind: 'no-skew' });
  });

  it('reports skew with runner-newer when runtime is newer at the patch-segment boundary', () => {
    // Compile-time leftmost non-zero is patch (0.0.5); runtime patch differs.
    expect(compareVersionsForSkew('0.0.5', '0.0.6')).toStrictEqual({ kind: 'skew', direction: 'runner-newer' });
  });

  it('reports skew with runner-older when runtime is older at the patch-segment boundary', () => {
    expect(compareVersionsForSkew('0.0.5', '0.0.4')).toStrictEqual({ kind: 'skew', direction: 'runner-older' });
  });

  it.each([
    ['invalid', '1.2.3'],
    ['1.2.3', 'invalid'],
    ['1.2', '1.2.3'],
    ['', '1.2.3'],
    ['1.2.3', ''],
  ])('reports no-skew for unparseable inputs: %s vs %s', (compileTime, runtime) => {
    expect(compareVersionsForSkew(compileTime, runtime)).toStrictEqual({ kind: 'no-skew' });
  });

  it('ignores pre-release suffixes when parsing', () => {
    // `0.20.0-beta` parses as `0.20.0`; identical to `0.20.0` → no-skew.
    expect(compareVersionsForSkew('0.20.0-beta.1', '0.20.0')).toStrictEqual({ kind: 'no-skew' });
  });

  it('ignores build metadata suffixes when parsing', () => {
    expect(compareVersionsForSkew('1.2.3+sha.abc', '1.2.3')).toStrictEqual({ kind: 'no-skew' });
  });
});
