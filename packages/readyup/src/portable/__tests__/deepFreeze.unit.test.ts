import { describe, expect, it } from 'vitest';

import { deepFreeze } from '../deepFreeze.ts';

describe(deepFreeze, () => {
  it('freezes an object and the objects and arrays nested inside it', () => {
    const value = { scripts: { build: 'tsc' }, files: ['dist'] };

    deepFreeze(value);

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.scripts)).toBe(true);
    expect(Object.isFrozen(value.files)).toBe(true);
  });

  it('accepts a primitive without throwing', () => {
    expect(() => deepFreeze('text')).not.toThrow();
    expect(() => deepFreeze(undefined)).not.toThrow();
    expect(() => deepFreeze(null)).not.toThrow();
  });

  it('terminates on a cyclic structure', () => {
    const parent: Record<string, unknown> = { name: 'parent' };
    const child = { parent };
    parent['child'] = child;

    deepFreeze(parent);

    expect(Object.isFrozen(parent)).toBe(true);
    expect(Object.isFrozen(child)).toBe(true);
  });
});
