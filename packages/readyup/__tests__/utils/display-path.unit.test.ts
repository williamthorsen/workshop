import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { toDisplayPath } from '../../src/utils/display-path.ts';

describe(toDisplayPath, () => {
  it('relativizes a path inside the current directory', () => {
    expect(toDisplayPath(path.join(process.cwd(), '.readyup/kits/default.js'))).toBe('.readyup/kits/default.js');
  });

  it('resolves a relative path against the current directory', () => {
    expect(toDisplayPath('.readyup/kits/default.js')).toBe('.readyup/kits/default.js');
  });

  it('keeps the absolute form for a path outside the current directory', () => {
    const outside = path.resolve(process.cwd(), '../elsewhere/kit.js');

    expect(toDisplayPath(outside)).toBe(outside);
  });

  it('keeps the absolute form for the current directory itself', () => {
    expect(toDisplayPath(process.cwd())).toBe(process.cwd());
  });
});
