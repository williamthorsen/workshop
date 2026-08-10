import { describe, expect, it } from 'vitest';

import { configError, internalError, kitLoadError, usageError } from '../errors.ts';
import { formatJsonError } from '../formatJsonError.ts';

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

    expect(output).not.toContain('\n');
  });

  it('carries a hint beside the message rather than inside it', () => {
    const error = configError('No manifest found at https://example.com/manifest.json.', {
      hint: 'If the repository is private, set GITHUB_TOKEN.',
    });

    expect(JSON.parse(formatJsonError(error))).toStrictEqual({
      schemaVersion: 1,
      error: {
        code: 'config',
        message: 'No manifest found at https://example.com/manifest.json.',
        hint: 'If the repository is private, set GITHUB_TOKEN.',
      },
    });
  });

  it('omits the field entirely when the error carries no hint', () => {
    expect(formatJsonError(usageError('x'))).not.toContain('hint');
  });
});
