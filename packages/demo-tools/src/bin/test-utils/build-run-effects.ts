import type { RunEffects } from '../run.ts';

/** Returns inert effects for a run at `/` on Apple Silicon macOS, with `overrides` spread over them. */
export function buildRunEffects(overrides: Partial<RunEffects> = {}): RunEffects {
  return {
    arch: 'arm64',
    cwd: '/',
    env: {},
    findTrackedPaths: () => {},
    findUnignoredPaths: () => {},
    homeDir: STUB_HOME_DIR,
    platform: 'darwin',
    readSourceState: () => {},
    resolveVersion: () => STUB_VERSION,
    ...overrides,
  };
}

export const STUB_HOME_DIR = '/home/demo';

export const STUB_VERSION = '9.9.9';
