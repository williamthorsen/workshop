import { describe, expect, it } from 'vitest';

import { resolveHookSpecifier } from '../src/bin/resolveHookSpecifier.ts';

describe(resolveHookSpecifier, () => {
  it.each([
    ['file:///repo/packages/readyup/src/bin/rdy.ts', '../readyupResolverHook.ts'],
    ['file:///repo/packages/readyup/dist/esm/bin/rdy.js', '../readyupResolverHook.js'],
    ['file:///repo/packages/readyup/dist/esm/bin/rdy.mjs', '../readyupResolverHook.js'],
  ])('when the runner URL is %s, resolves %s', (runnerUrl, expected) => {
    expect(resolveHookSpecifier(runnerUrl)).toBe(expected);
  });
});
