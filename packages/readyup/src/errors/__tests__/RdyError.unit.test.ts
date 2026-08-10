import { describe, expect, it } from 'vitest';

import { configError, RdyError, toRdyError } from '../RdyError.ts';

describe(toRdyError, () => {
  it('returns an RdyError unchanged, so its diagnosis and hint survive the boundary', () => {
    const original = configError('boom', { hint: 'Set GITHUB_TOKEN.' });

    expect(toRdyError(original)).toBe(original);
  });

  it('classifies an unrecognized failure as internal', () => {
    const coerced = toRdyError(new Error('boom'));

    expect(coerced).toBeInstanceOf(RdyError);
    expect(coerced.code).toBe('internal');
    expect(coerced.message).toBe('boom');
  });

  it('forwards a hint carried by an unrecognized failure', () => {
    const coerced = toRdyError(Object.assign(new Error('boom'), { hint: 'Install it.' }));

    expect(coerced.hint).toBe('Install it.');
  });

  it('leaves the hint absent when the failure carries none', () => {
    expect(toRdyError(new Error('boom')).hint).toBeUndefined();
  });

  it('attaches the thrown value as the cause', () => {
    const thrown = new Error('boom');

    expect(toRdyError(thrown).cause).toBe(thrown);
  });
});
