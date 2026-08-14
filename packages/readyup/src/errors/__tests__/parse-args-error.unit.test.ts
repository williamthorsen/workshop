import { parseArgs } from 'node:util';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { translateParseArgsError } from '../parse-args-error.ts';

const options = {
  file: { type: 'string', short: 'f' },
  json: { type: 'boolean', short: 'j' },
} as const;

describe(translateParseArgsError, () => {
  it('points an unknown option at the command help', async () => {
    const message = translateParseArgsError(await parseArgsError(['--nope']), 'list');

    expect(message).toBe("Unknown option '--nope'. Run 'rdy list --help' to see available options.");
  });

  it('names the command it was given', async () => {
    const message = translateParseArgsError(await parseArgsError(['--nope']), 'run');

    expect(message).toBe("Unknown option '--nope'. Run 'rdy run --help' to see available options.");
  });

  it('reports an unknown short option by the spelling that was given', async () => {
    const message = translateParseArgsError(await parseArgsError(['-z']), 'compile');

    expect(message).toBe("Unknown option '-z'. Run 'rdy compile --help' to see available options.");
  });

  it('leaves out the positional-escape advice Node offers', async () => {
    const message = translateParseArgsError(await parseArgsError(['--nope']), 'run');

    expect(message).not.toContain('positional');
  });

  it('applies the hint when a string flag is missing its value', async () => {
    const message = translateParseArgsError(await parseArgsError(['--file']), 'run', {
      '--file': '--file requires a path argument',
    });

    expect(message).toBe('--file requires a path argument');
  });

  it('applies the hint when a string flag is followed by another option (ambiguous)', async () => {
    const message = translateParseArgsError(await parseArgsError(['--file', '--json']), 'run', {
      '--file': '--file requires a path argument',
    });

    expect(message).toBe('--file requires a path argument');
  });

  it('falls back to a generic message when no hint matches the missing-value flag', async () => {
    const message = translateParseArgsError(await parseArgsError(['--file']), 'run');

    expect(message).toBe('--file requires a value');
  });

  it('passes a boolean-given-a-value error through instead of claiming a value is required', async () => {
    const message = translateParseArgsError(await parseArgsError(['--json=x']), 'run', {
      '--json': '--json requires a value',
    });

    expect(message).toContain('does not take an argument');
    expect(message).not.toContain('requires a value');
  });

  it('stringifies a non-Error value', () => {
    expect(translateParseArgsError('raw string', 'run')).toBe('raw string');
  });
});

/** Returns the error `node:util.parseArgs` raises for `args`, failing the test when it parses them. */
async function parseArgsError(args: string[]): Promise<Error> {
  return captureError(() => parseArgs({ args, options, strict: true, allowPositionals: true }));
}
