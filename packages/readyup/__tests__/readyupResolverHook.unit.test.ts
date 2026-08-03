import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initialize, resolve } from '../src/readyupResolverHook.ts';

const READYUP_PARENT_URL = 'file:///runner/node_modules/readyup/dist/esm/bin/rdy.js';
const KIT_PARENT_URL = 'file:///tmp/rdy-XYZ/kit.js';

/** Build the minimal `context` object Node passes to a resolve hook. */
function buildContext(overrides: Partial<{ parentURL: string; conditions: string[] }> = {}) {
  return {
    conditions: overrides.conditions ?? ['node', 'import'],
    importAttributes: {},
    parentURL: overrides.parentURL,
  };
}

/** Default `nextResolve` stub that returns a synthetic URL. */
function buildNextResolve() {
  return vi.fn().mockReturnValue({ url: 'file:///resolved.js', shortCircuit: true });
}

describe('readyupResolverHook', () => {
  beforeEach(() => {
    initialize({ readyupParentURL: READYUP_PARENT_URL });
  });

  describe(resolve, () => {
    it("rewrites parentURL to the runner's readyup URL for the bare 'readyup' specifier", () => {
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      void resolve('readyup', context, nextResolve);

      expect(nextResolve).toHaveBeenCalledTimes(1);
      expect(nextResolve).toHaveBeenCalledWith('readyup', {
        conditions: context.conditions,
        importAttributes: context.importAttributes,
        parentURL: READYUP_PARENT_URL,
      });
    });

    it("rewrites parentURL for 'readyup/<subpath>' specifiers", () => {
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      void resolve('readyup/check-utils', context, nextResolve);

      expect(nextResolve).toHaveBeenCalledTimes(1);
      expect(nextResolve).toHaveBeenCalledWith('readyup/check-utils', {
        conditions: context.conditions,
        importAttributes: context.importAttributes,
        parentURL: READYUP_PARENT_URL,
      });
    });

    it('passes non-readyup specifiers through with the original context unchanged', () => {
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      void resolve('node:fs', context, nextResolve);

      expect(nextResolve).toHaveBeenCalledTimes(1);
      expect(nextResolve).toHaveBeenCalledWith('node:fs', context);
    });

    it("does not match specifiers that merely start with 'readyup' (e.g., 'readyup-other')", () => {
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      void resolve('readyup-other', context, nextResolve);

      expect(nextResolve).toHaveBeenCalledTimes(1);
      expect(nextResolve).toHaveBeenCalledWith('readyup-other', context);
    });

    it('passes a relative specifier through unchanged', () => {
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      void resolve('./helper.js', context, nextResolve);

      expect(nextResolve).toHaveBeenCalledWith('./helper.js', context);
    });

    it('returns the value produced by nextResolve', () => {
      const expectedResult = { url: 'file:///elsewhere.js', shortCircuit: true };
      const nextResolve = vi.fn().mockReturnValue(expectedResult);
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      const result = resolve('readyup', context, nextResolve);

      expect(result).toBe(expectedResult);
    });
  });

  describe(initialize, () => {
    it("stores the readyupParentURL so subsequent 'readyup' resolves use it", () => {
      initialize({ readyupParentURL: 'file:///different/runner/node_modules/readyup/index.js' });
      const nextResolve = buildNextResolve();

      void resolve('readyup', buildContext({ parentURL: KIT_PARENT_URL }), nextResolve);

      expect(nextResolve).toHaveBeenCalledWith('readyup', {
        conditions: expect.any(Array),
        importAttributes: expect.any(Object),
        parentURL: 'file:///different/runner/node_modules/readyup/index.js',
      });
    });
  });

  describe('when initialize() has not been called', () => {
    it('throws a descriptive error if a readyup specifier is resolved', async () => {
      // The module-level `readyupParentURL` is set by `initialize()` (called in
      // `beforeEach`); reset it by re-importing the module in isolation so the
      // throw branch is reachable.
      vi.resetModules();
      const { resolve: freshResolve } = await import('../src/readyupResolverHook.ts');
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      expect(() => freshResolve('readyup', context, nextResolve)).toThrow(
        /readyupResolverHook: initialize\(\) was not called/,
      );
      expect(nextResolve).not.toHaveBeenCalled();
    });

    it('passes non-readyup specifiers through unchanged even if initialize() has not been called', async () => {
      vi.resetModules();
      const { resolve: freshResolve } = await import('../src/readyupResolverHook.ts');
      const nextResolve = buildNextResolve();
      const context = buildContext({ parentURL: KIT_PARENT_URL });

      void freshResolve('node:fs', context, nextResolve);

      expect(nextResolve).toHaveBeenCalledTimes(1);
      expect(nextResolve).toHaveBeenCalledWith('node:fs', context);
    });
  });
});
