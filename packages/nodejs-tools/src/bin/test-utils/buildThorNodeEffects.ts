import type { ThorNodeEffects } from '../thor-node-effects.ts';

/**
 * Builds effects that find nothing and do nothing: no pin, no pnpm, no stranded shims, no terminal on stdin, and the
 * clock at the epoch. The overrides replace any of them.
 */
export function buildThorNodeEffects(overrides: Partial<ThorNodeEffects> = {}): ThorNodeEffects {
  return {
    cwd: '/work',
    execPath: '/usr/local/bin/node',
    findPin: () => {},
    homeDir: '/home',
    isStdinTty: () => false,
    listStrandedShims: () => [],
    now: () => 0,
    pathDirs: [],
    readAnswer: () => Promise.resolve(undefined),
    resolvePnpmProvider: () => ({ kind: 'absent' }),
    resolveVersion: () => '0.0.0',
    runPnpmVersion: () => ({ failure: 'not run' }),
    ...overrides,
  };
}
