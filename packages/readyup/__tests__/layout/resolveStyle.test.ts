import { describe, expect, it } from 'vitest';

import { describeInvalidStyle, resolveStyle, STYLE_ENV_VAR, STYLE_FLAG } from '../../src/layout/resolveStyle.ts';

/** An environment naming no style and no CI, so detection rests on the terminal alone. */
const BARE_ENV = {};

const TTY = true;
const PIPE = false;

describe('the --style flag', () => {
  it.each(['plain', 'rich'] as const)('takes %s as a spaced value', (style) => {
    expect(resolveStyle([STYLE_FLAG, style], BARE_ENV, TTY).style).toBe(style);
  });

  it.each(['plain', 'rich'] as const)('takes %s as an assigned value', (style) => {
    expect(resolveStyle([`${STYLE_FLAG}=${style}`], BARE_ENV, TTY).style).toBe(style);
  });

  it('outranks the environment variable', () => {
    expect(resolveStyle([STYLE_FLAG, 'rich'], { [STYLE_ENV_VAR]: 'plain' }, PIPE).style).toBe('rich');
  });

  it('keeps the last occurrence, as the argument parser would', () => {
    expect(resolveStyle([STYLE_FLAG, 'rich', STYLE_FLAG, 'plain'], BARE_ENV, TTY).style).toBe('plain');
  });

  it('ignores a value after the positional terminator', () => {
    expect(resolveStyle(['--', STYLE_FLAG, 'plain'], BARE_ENV, TTY).style).toBe('rich');
  });

  it('defers to detection when it names auto', () => {
    expect(resolveStyle([STYLE_FLAG, 'auto'], BARE_ENV, PIPE).style).toBe('plain');
    expect(resolveStyle([STYLE_FLAG, 'auto'], BARE_ENV, TTY).style).toBe('rich');
  });

  it('defers to detection even when the environment names a style', () => {
    expect(resolveStyle([STYLE_FLAG, 'auto'], { [STYLE_ENV_VAR]: 'plain' }, TTY).style).toBe('rich');
  });
});

describe('the environment variable', () => {
  it.each(['plain', 'rich'] as const)('is honored when it names %s', (style) => {
    expect(resolveStyle([], { [STYLE_ENV_VAR]: style }, PIPE).style).toBe(style);
  });

  it('outranks detection', () => {
    expect(resolveStyle([], { [STYLE_ENV_VAR]: 'rich' }, PIPE).style).toBe('rich');
  });

  it('is ignored when empty, so an unset-looking export does not shadow detection', () => {
    expect(resolveStyle([], { [STYLE_ENV_VAR]: '' }, TTY).style).toBe('rich');
  });

  it('defers to detection when it names auto', () => {
    expect(resolveStyle([], { [STYLE_ENV_VAR]: 'auto' }, PIPE).style).toBe('plain');
  });
});

describe('detection', () => {
  it('chooses rich for a terminal outside CI', () => {
    expect(resolveStyle([], BARE_ENV, TTY).style).toBe('rich');
  });

  it('chooses plain when the output is not a terminal', () => {
    expect(resolveStyle([], BARE_ENV, PIPE).style).toBe('plain');
  });

  it('chooses plain under CI even when a terminal is attached', () => {
    expect(resolveStyle([], { CI: 'true' }, TTY).style).toBe('plain');
  });

  it.each(['1', 'yes', 'anything'])('reads CI=%s as CI', (value) => {
    expect(resolveStyle([], { CI: value }, TTY).style).toBe('plain');
  });

  it.each(['false', ''])('reads CI=%s as a denial', (value) => {
    expect(resolveStyle([], { CI: value }, TTY).style).toBe('rich');
  });
});

describe('a value naming no style', () => {
  it('is reported rather than thrown, so the complaint still has a style to render in', () => {
    const resolution = resolveStyle([STYLE_FLAG, 'emoji'], BARE_ENV, TTY);

    expect(resolution.invalid).toStrictEqual({ source: STYLE_FLAG, value: 'emoji' });
    expect(resolution.style).toBe('rich');
  });

  it('is reported for the environment variable too', () => {
    const resolution = resolveStyle([], { [STYLE_ENV_VAR]: 'text' }, PIPE);

    expect(resolution.invalid).toStrictEqual({ source: STYLE_ENV_VAR, value: 'text' });
    expect(resolution.style).toBe('plain');
  });

  it('falls through to the next source for the rendering itself', () => {
    const resolution = resolveStyle([STYLE_FLAG, 'nonsense'], { [STYLE_ENV_VAR]: 'plain' }, TTY);

    expect(resolution.style).toBe('plain');
    expect(resolution.invalid?.source).toBe(STYLE_FLAG);
  });

  it('blames the flag over the environment when both are wrong', () => {
    const resolution = resolveStyle([STYLE_FLAG, 'a'], { [STYLE_ENV_VAR]: 'b' }, TTY);

    expect(resolution.invalid).toStrictEqual({ source: STYLE_FLAG, value: 'a' });
  });

  it('is absent from a resolution nothing is wrong with', () => {
    expect(resolveStyle([STYLE_FLAG, 'plain'], BARE_ENV, TTY).invalid).toBeUndefined();
  });

  it('names the valid set in its message', () => {
    const message = describeInvalidStyle({ source: STYLE_FLAG, value: 'emoji' });

    expect(message).toBe('--style must be one of: auto, plain, rich (got "emoji")');
  });
});
