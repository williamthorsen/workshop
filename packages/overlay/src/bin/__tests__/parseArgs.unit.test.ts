import { describe, expect, it } from 'vitest';

import { parseArgs } from '../parseArgs.ts';

describe(parseArgs, () => {
  it('defaults to verify mode with no target when only a source is given', () => {
    expect(parseArgs(['./source'])).toStrictEqual({
      kind: 'run',
      source: './source',
      target: undefined,
      mode: 'verify',
      json: false,
    });
  });

  it('reads source and target positionals', () => {
    const parsed = parseArgs(['./source', './target']);

    expect(parsed).toMatchObject({ kind: 'run', source: './source', target: './target' });
  });

  it.each([
    ['--create', 'create'],
    ['--force', 'force'],
    ['--verify', 'verify'],
  ] as const)('selects %s mode', (flag, mode) => {
    expect(parseArgs(['./source', flag])).toMatchObject({ mode });
  });

  it('sets json when --json is passed', () => {
    expect(parseArgs(['./source', '--json'])).toMatchObject({ json: true });
  });

  it('returns a help command for --help', () => {
    expect(parseArgs(['--help'])).toStrictEqual({ kind: 'help' });
  });

  it('returns a help command for -h', () => {
    expect(parseArgs(['-h'])).toStrictEqual({ kind: 'help' });
  });

  it('rejects more than one mode flag', () => {
    expect(() => parseArgs(['./source', '--create', '--force'])).toThrow(/only one of/);
  });

  it('throws when the source positional is missing', () => {
    expect(() => parseArgs(['--create'])).toThrow(/missing required argument/);
  });

  it('throws on an unknown option', () => {
    expect(() => parseArgs(['./source', '--nope'])).toThrow(/unknown option: --nope/);
  });

  it('throws when a boolean option is given a value', () => {
    expect(() => parseArgs(['./source', '--json=x'])).toThrow(/option takes no value: --json/);
  });

  it.each([['--h'], ['--h=1']])('reports %s as an unknown option, not the -h short flag', (flag) => {
    expect(() => parseArgs(['./source', flag])).toThrow(/unknown option: --h/);
  });

  it('keeps the underlying parse error as the cause', () => {
    expect(catchError(() => parseArgs(['./source', '--nope']))).toHaveProperty(
      'cause.code',
      'ERR_PARSE_ARGS_UNKNOWN_OPTION',
    );
    expect(catchError(() => parseArgs(['./source', '--json=x']))).toHaveProperty(
      'cause.code',
      'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
    );
  });
});

// region | Helpers

/** Returns the value `act` throws, or `undefined` when it returns normally. */
function catchError(act: () => unknown): unknown {
  try {
    act();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

// endregion | Helpers
