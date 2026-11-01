import { describe, expect, it } from 'vitest';

import { formatTakeDirName } from '../format-take-dir-name.ts';

const RENDERED_AT = new Date('2026-11-01T03:04:05.678Z');

const COMMIT = '8fb274999a020d79b8524b3f969e0c91687d7d5c';

describe(formatTakeDirName, () => {
  it.each([
    [{ commit: COMMIT, dirty: false }, '20261101-030405Z_8fb2749'],
    [{ commit: COMMIT, dirty: true }, '20261101-030405Z_8fb2749-dirty'],
    [undefined, '20261101-030405Z_nogit'],
  ])('names the take for %o', (source, expected) => {
    expect(formatTakeDirName(RENDERED_AT, source)).toBe(expected);
  });
});
