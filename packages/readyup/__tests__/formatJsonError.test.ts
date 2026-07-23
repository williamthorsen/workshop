import { describe, expect, it } from 'vitest';

import { configError, internalError, kitLoadError, usageError } from '../src/errors.ts';
import { formatJsonError } from '../src/formatJsonError.ts';

describe(formatJsonError, () => {
  it('wraps the code and message in a versioned envelope carrying nothing else', () => {
    const output = formatJsonError(usageError('something went wrong'));
    const parsed: unknown = JSON.parse(output);

    expect(parsed).toStrictEqual({
      schemaVersion: 1,
      error: { code: 'usage', message: 'something went wrong' },
    });
  });

  it.each([
    ['usage', usageError('x')],
    ['config', configError('x')],
    ['kit-load', kitLoadError('x')],
    ['internal', internalError('x')],
  ])('reports the %s code', (code, error) => {
    expect(JSON.parse(formatJsonError(error))).toMatchObject({ error: { code } });
  });

  it('produces a single-line string', () => {
    const output = formatJsonError(usageError('multi\nline\nmessage'));

    expect(output.includes('\n')).toBe(false);
  });
});
