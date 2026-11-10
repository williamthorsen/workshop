import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { parseSubcommandArgs } from '../parseSubcommandArgs.ts';

const options = {
  config: { type: 'string' },
  file: { type: 'string', short: 'f' },
  json: { type: 'boolean' },
} as const;

const hints = { '--file': '--file requires a path argument' };

describe(parseSubcommandArgs, () => {
  it('returns the parsed values and positionals', () => {
    const { positionals, values } = parseSubcommandArgs({
      args: ['kit', '--file', 'a.ts', '--json'],
      command: 'run',
      options,
    });

    expect(positionals).toStrictEqual(['kit']);
    // `parseArgs` returns `values` with a null prototype, which `toStrictEqual` rejects against a literal.
    expect({ ...values }).toStrictEqual({ file: 'a.ts', json: true });
  });

  it('accepts --style without the command declaring it', () => {
    const { values } = parseSubcommandArgs({ args: ['--style', 'plain'], command: 'list', options });

    expect(values.style).toBe('plain');
  });

  it('reports an unknown option as a usage error against the command', async () => {
    const error = await parseRaising(['--nope']);

    expect(error.code).toBe('usage');
    expect(error.message).toBe("Unknown option '--nope'. Run 'rdy run --help' to see available options.");
  });

  it('applies the hint when a flag is missing its value', async () => {
    const error = await parseRaising(['--file']);

    expect(error.code).toBe('usage');
    expect(error.message).toBe('--file requires a path argument');
  });

  it('applies the hint when a flag is given an empty value', async () => {
    const error = await parseRaising(['--file=']);

    expect(error.code).toBe('usage');
    expect(error.message).toBe('--file requires a path argument');
  });

  it('reports an empty value generically when the flag has no hint', async () => {
    const error = await parseRaising(['--config=']);

    expect(error.code).toBe('usage');
    expect(error.message).toBe('--config requires a value');
  });

  it('rejects an empty --style', async () => {
    const error = await parseRaising(['--style=']);

    expect(error.message).toBe('--style requires a value');
  });
});

// region | Helpers

/** Returns the usage error that `parseSubcommandArgs` raises for `args` under the `run` command and its hints. */
async function parseRaising(args: string[]): Promise<RdyError> {
  return captureError(RdyError, () => parseSubcommandArgs({ args, command: 'run', hints, options }));
}

// endregion | Helpers
