import { describe, expect, it } from 'vitest';

import { formatJsonError } from '../src/formatJsonError.ts';

describe(formatJsonError, () => {
  it('returns valid JSON with an error field', () => {
    const output = formatJsonError('something went wrong');
    const parsed: unknown = JSON.parse(output);

    expect(parsed).toStrictEqual({ error: 'something went wrong' });
  });

  it('produces a single-line string', () => {
    const output = formatJsonError('multi\nline\nmessage');

    expect(output.includes('\n')).toBe(false);
  });
});
