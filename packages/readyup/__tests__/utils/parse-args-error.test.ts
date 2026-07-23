import { parseArgs } from 'node:util';

import { describe, expect, it } from 'vitest';

import { translateParseArgsError } from '../../src/utils/parse-args-error.ts';

const options = {
  file: { type: 'string', short: 'f' },
  json: { type: 'boolean', short: 'j' },
} as const;

describe('translateParseArgsError', () => {
  it('points an unknown option at the command help', () => {
    const message = translateParseArgsError(captureError(['--nope']), 'list');

    expect(message).toBe("Unknown option '--nope'. Run 'rdy list --help' to see available options.");
  });

  it('names the command it was given', () => {
    const message = translateParseArgsError(captureError(['--nope']), 'run');

    expect(message).toBe("Unknown option '--nope'. Run 'rdy run --help' to see available options.");
  });

  it('reports an unknown short option by the spelling that was given', () => {
    const message = translateParseArgsError(captureError(['-z']), 'compile');

    expect(message).toBe("Unknown option '-z'. Run 'rdy compile --help' to see available options.");
  });

  it('leaves out the positional-escape advice Node offers', () => {
    const message = translateParseArgsError(captureError(['--nope']), 'run');

    expect(message).not.toContain('positional');
  });

  it('applies the hint when a string flag is missing its value', () => {
    const message = translateParseArgsError(captureError(['--file']), 'run', {
      '--file': '--file requires a path argument',
    });

    expect(message).toBe('--file requires a path argument');
  });

  it('applies the hint when a string flag is followed by another option (ambiguous)', () => {
    const message = translateParseArgsError(captureError(['--file', '--json']), 'run', {
      '--file': '--file requires a path argument',
    });

    expect(message).toBe('--file requires a path argument');
  });

  it('falls back to a generic message when no hint matches the missing-value flag', () => {
    const message = translateParseArgsError(captureError(['--file']), 'run');

    expect(message).toBe('--file requires a value');
  });

  it('passes a boolean-given-a-value error through instead of claiming a value is required', () => {
    const message = translateParseArgsError(captureError(['--json=x']), 'run', {
      '--json': '--json requires a value',
    });

    expect(message).toContain('does not take an argument');
    expect(message).not.toContain('requires a value');
  });

  it('stringifies a non-Error value', () => {
    expect(translateParseArgsError('raw string', 'run')).toBe('raw string');
  });
});

/** Run node:util.parseArgs and return whatever it throws, failing if it unexpectedly succeeds. */
function captureError(args: string[]): unknown {
  try {
    parseArgs({ args, options, strict: true, allowPositionals: true });
  } catch (error) {
    return error;
  }
  throw new Error('expected parseArgs to throw');
}
