import { describe, expect, it } from 'vitest';

import { parseStatus } from '../parseStatus.ts';

describe(parseStatus, () => {
  it('reads the apply-side (second) column of each row', () => {
    const stdout = ' M .difffile\n A .newfile\n D .removeme\n R normalize.sh\n';

    expect(parseStatus(stdout)).toStrictEqual([
      { path: '.difffile', code: 'M' },
      { path: '.newfile', code: 'A' },
      { path: '.removeme', code: 'D' },
      { path: 'normalize.sh', code: 'R' },
    ]);
  });

  it('returns an empty array for clean (empty) output', () => {
    expect(parseStatus('')).toStrictEqual([]);
  });

  it('ignores rows whose apply-side column is blank', () => {
    const stdout = 'A  .source-only-change\n A .newfile\n';

    expect(parseStatus(stdout)).toStrictEqual([{ path: '.newfile', code: 'A' }]);
  });

  it('ignores malformed and too-short lines', () => {
    const stdout = 'x\n M\n  \n A .keep\n';

    expect(parseStatus(stdout)).toStrictEqual([{ path: '.keep', code: 'A' }]);
  });

  it('ignores unrecognized apply-side codes', () => {
    const stdout = ' Z .weird\n M .real\n';

    expect(parseStatus(stdout)).toStrictEqual([{ path: '.real', code: 'M' }]);
  });

  it('preserves paths containing spaces', () => {
    expect(parseStatus(' A .config/my file.txt\n')).toStrictEqual([{ path: '.config/my file.txt', code: 'A' }]);
  });
});
