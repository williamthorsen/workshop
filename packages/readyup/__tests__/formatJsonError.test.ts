import { describe, expect, it } from 'vitest';

import { configError, internalError, kitLoadError, RdyError, usageError } from '../src/errors.ts';
import { formatJsonError } from '../src/formatJsonError.ts';

describe(formatJsonError, () => {
  it('wraps the message, code, and remedy in a versioned envelope', () => {
    const output = formatJsonError(usageError('something went wrong'));
    const parsed: unknown = JSON.parse(output);

    expect(parsed).toStrictEqual({
      error: { code: 'usage', message: 'something went wrong', remedy: '' },
      schemaVersion: 1,
    });
  });

  it('carries the remedy when one is supplied', () => {
    const output = formatJsonError(new RdyError('config', 'bad config', { remedy: 'Run `rdy init`.' }));
    const parsed: unknown = JSON.parse(output);

    expect(parsed).toMatchObject({ error: { remedy: 'Run `rdy init`.' } });
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
