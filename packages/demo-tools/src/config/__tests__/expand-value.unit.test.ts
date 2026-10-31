import { describe, expect, it } from 'vitest';

import { expandValue } from '../expand-value.ts';

const HOME = '/home/demo';

describe(expandValue, () => {
  it('replaces each ${VAR} from the environment', () => {
    expect(expandValue('${A}-${B}/x', { A: 'one', B: 'two' }, HOME)).toStrictEqual({ ok: true, value: 'one-two/x' });
  });

  it('returns a value without expansions unchanged', () => {
    expect(expandValue('plain', {}, HOME)).toStrictEqual({ ok: true, value: 'plain' });
  });

  it.each([
    ['~', HOME],
    ['~/profiles/demo', `${HOME}/profiles/demo`],
  ])('expands a leading %o to the home directory', (value, expected) => {
    expect(expandValue(value, {}, HOME)).toStrictEqual({ ok: true, value: expected });
  });

  it.each([['~user/x'], ['a/~/b'], ['x~']])('leaves %o literal', (value) => {
    expect(expandValue(value, {}, HOME)).toStrictEqual({ ok: true, value });
  });

  it('does not expand a ~ that a variable supplies', () => {
    expect(expandValue('${P}', { P: '~/x' }, HOME)).toStrictEqual({ ok: true, value: '~/x' });
  });

  it('reports an unset variable', () => {
    expect(expandValue('${MISSING}', {}, HOME)).toStrictEqual({ ok: false, problem: 'MISSING is not set' });
  });

  it('reports an unsupported expansion form', () => {
    expect(expandValue('${A:-x}', { A: 'a' }, HOME)).toStrictEqual({
      ok: false,
      problem: 'unsupported expansion "${A:-x}"',
    });
  });

  it('reports an unterminated expansion', () => {
    expect(expandValue('a${B', { B: 'b' }, HOME)).toStrictEqual({ ok: false, problem: 'unterminated "${B"' });
  });
});
