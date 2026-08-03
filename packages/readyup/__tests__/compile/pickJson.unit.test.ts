import { describe, expect, it } from 'vitest';

import { pickJson } from '../../src/compile/pickJson.ts';

describe(pickJson, () => {
  it('throws when called at runtime', () => {
    expect(() => pickJson('package.json', ['name'])).toThrow('pickJson is a compile-time-only function');
  });

  it('includes guidance to compile the kit in the error message', () => {
    expect(() => pickJson('package.json', ['name'])).toThrow('rdy compile');
  });
});
