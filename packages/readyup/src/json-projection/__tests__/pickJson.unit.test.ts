import { describe, expect, it } from 'vitest';

import { pickJson } from '../pickJson.ts';

describe(pickJson, () => {
  it('throws when called at runtime, naming both commands that resolve it', () => {
    expect(() => pickJson('package.json', ['name'])).toThrow(
      'pickJson is resolved when a kit is compiled with `rdy compile` or run from source with `rdy run --jit`. ' +
        'It cannot be called directly.',
    );
  });
});
