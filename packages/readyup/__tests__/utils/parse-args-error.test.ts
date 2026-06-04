import { parseArgs } from 'node:util';

import { describe, expect, it } from 'vitest';

import { translateParseArgsError } from '../../src/utils/parse-args-error.ts';

const options = {
  file: { type: 'string', short: 'f' },
  json: { type: 'boolean', short: 'j' },
} as const;

/** Run node:util.parseArgs and return whatever it throws, failing if it unexpectedly succeeds. */
function captureError(args: string[]): unknown {
  try {
    parseArgs({ args, options, strict: true, allowPositionals: true });
  } catch (error) {
    return error;
  }
  throw new Error('expected parseArgs to throw');
}

describe('translateParseArgsError', () => {
  it('passes an unknown-option error through to Node text', () => {
    const message = translateParseArgsError(captureError(['--nope']));

    expect(message).toContain('--nope');
    expect(message).toContain('Unknown option');
  });

  it('applies the hint when a string flag is missing its value', () => {
    const message = translateParseArgsError(captureError(['--file']), { '--file': '--file requires a path argument' });

    expect(message).toBe('--file requires a path argument');
  });

  it('applies the hint when a string flag is followed by another option (ambiguous)', () => {
    const message = translateParseArgsError(captureError(['--file', '--json']), {
      '--file': '--file requires a path argument',
    });

    expect(message).toBe('--file requires a path argument');
  });

  it('falls back to a generic message when no hint matches the missing-value flag', () => {
    const message = translateParseArgsError(captureError(['--file']));

    expect(message).toBe('--file requires a value');
  });

  it('passes a boolean-given-a-value error through instead of claiming a value is required', () => {
    const message = translateParseArgsError(captureError(['--json=x']), { '--json': '--json requires a value' });

    expect(message).toContain('does not take an argument');
    expect(message).not.toContain('requires a value');
  });

  it('stringifies a non-Error value', () => {
    expect(translateParseArgsError('raw string')).toBe('raw string');
  });
});
