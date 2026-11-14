import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { OverlayError } from '../../OverlayError.ts';
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

  it('rejects more than one mode flag', async () => {
    await expect(
      captureError(OverlayError, () => parseArgs(['./source', '--create', '--force'])),
    ).resolves.toHaveProperty('message', expect.stringMatching(/only one of/));
  });

  it('throws when the source positional is missing', async () => {
    await expect(captureError(OverlayError, () => parseArgs(['--create']))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/missing required argument/),
    );
  });

  it('throws on an unknown option', async () => {
    await expect(captureError(OverlayError, () => parseArgs(['./source', '--nope']))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/unknown option: --nope/),
    );
  });

  it('throws when a boolean option is given a value', async () => {
    await expect(captureError(OverlayError, () => parseArgs(['./source', '--json=x']))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/option takes no value: --json/),
    );
  });

  it.each([['--h'], ['--h=1']])('reports %s as an unknown option, not the -h short flag', async (flag) => {
    await expect(captureError(OverlayError, () => parseArgs(['./source', flag]))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/unknown option: --h/),
    );
  });

  it('keeps the underlying parse error as the cause', async () => {
    await expect(captureError(OverlayError, () => parseArgs(['./source', '--nope']))).resolves.toHaveProperty(
      'cause.code',
      'ERR_PARSE_ARGS_UNKNOWN_OPTION',
    );
    await expect(captureError(OverlayError, () => parseArgs(['./source', '--json=x']))).resolves.toHaveProperty(
      'cause.code',
      'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
    );
  });
});
