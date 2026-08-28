import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runnerVersion = vi.hoisted(() => ({ current: '0.34.0' }));

vi.mock(import('../../version.ts'), () => ({
  get VERSION() {
    return runnerVersion.current;
  },
}));

import type { RdyKit } from '../../kits/types.ts';
import { assertSatisfiesVersionFloor, warnOnVersionSkew } from '../version-skew.ts';

describe(assertSatisfiesVersionFloor, () => {
  beforeEach(() => {
    runnerVersion.current = '0.34.0';
  });

  it('passes a kit that declares no floor', () => {
    expect(() => assertSatisfiesVersionFloor('kit', buildKit())).not.toThrow();
  });

  it.each([['0.33.0'], ['0.34.0'], ['0.1'], ['0']])('passes a floor of %s the runner meets', (floor) => {
    expect(() => assertSatisfiesVersionFloor('kit', buildKit(floor))).not.toThrow();
  });

  it('fails a floor above the runner, naming both versions', async () => {
    const error = await captureError(() => assertSatisfiesVersionFloor('sweep', buildKit('0.35.0')));

    expect(error.message).toContain('kit "sweep" requires readyup 0.35.0 or later');
    expect(error.message).toContain('this runner is 0.34.0');
  });

  it('carries a hint naming the upgrade', async () => {
    const error = await captureError(() => assertSatisfiesVersionFloor('sweep', buildKit('0.35.0')));

    expect(error).toHaveProperty('code', 'kit-load');
    expect(error).toHaveProperty('hint', expect.stringContaining('0.35.0'));
  });

  // A prerelease segment is `NaN` to `compareVersions`, which satisfies neither `>=` nor `<`, so an
  // unnormalized runner would pass every floor and fail none.
  it('measures a prerelease runner by its numeric core', () => {
    runnerVersion.current = '0.35.0-rc.1';

    expect(() => assertSatisfiesVersionFloor('kit', buildKit('0.35.0'))).not.toThrow();
    expect(() => assertSatisfiesVersionFloor('kit', buildKit('0.36.0'))).toThrow('requires readyup 0.36.0');
  });
});

describe(warnOnVersionSkew, () => {
  beforeEach(() => {
    runnerVersion.current = '0.34.0';
  });

  it('reports a bundle compiled ahead of the runner', () => {
    const [warning] = warnOnVersionSkew('sweep', buildKit(), '0.35.0');

    expect(warning).toHaveProperty('code', 'version-skew');
    expect(warning?.message).toContain('compiled by readyup 0.35.0');
    expect(warning?.message).toContain('ahead of the 0.34.0 running it');
    expect(warning?.remedy).toContain('0.35.0');
  });

  it.each([['0.32.0'], ['0.34.0']])('reports nothing for a bundle stamped %s', (stamp) => {
    expect(warnOnVersionSkew('kit', buildKit(), stamp)).toStrictEqual([]);
  });

  it('reports nothing for a bundle carrying no stamp', () => {
    expect(warnOnVersionSkew('kit', buildKit(), undefined)).toStrictEqual([]);
  });

  // The floor is the author's own statement of what the kit needs, and it has already been enforced.
  it('reports nothing for a kit that declares a floor', () => {
    expect(warnOnVersionSkew('kit', buildKit('0.30.0'), '0.35.0')).toStrictEqual([]);
  });

  it('measures a prerelease runner by its numeric core', () => {
    runnerVersion.current = '0.35.0-rc.1';

    expect(warnOnVersionSkew('kit', buildKit(), '0.35.0')).toStrictEqual([]);
    expect(warnOnVersionSkew('kit', buildKit(), '0.36.0')).toHaveLength(1);
  });
});

// region | Helpers

/** Builds a minimal kit, optionally declaring a readyup floor. */
function buildKit(minReadyupVersion?: string): RdyKit {
  return {
    checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }],
    ...(minReadyupVersion !== undefined && { minReadyupVersion }),
  };
}

// endregion | Helpers
