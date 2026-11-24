import { CATALOGUE_PATH, readCatalogue } from '../../catalogue/read-catalogue.ts';
import type { RunEffects } from '../run.ts';

/** The instant at which a run built by `buildRunEffects` starts. */
export const FIXED_NOW = new Date('2026-11-24T12:34:56.789Z');

/** The seed that a run built by `buildRunEffects` draws when none is given. */
export const DRAWN_SEED = 4242;

/**
 * Returns effects for an Apple Silicon machine, with the shipped catalogue, a fixed clock and seed, and a worker that
 * fails the test when called; `overrides` replaces any of them.
 */
export function buildRunEffects(overrides: Partial<RunEffects> = {}): RunEffects {
  return {
    arch: 'arm64',
    cwd: '/work',
    drawSeed: () => DRAWN_SEED,
    env: { PATH: '/usr/bin' },
    now: () => FIXED_NOW,
    platform: 'darwin',
    readCatalogue: () => readCatalogue(CATALOGUE_PATH),
    resolveVersion: () => '9.9.9',
    runWorker: () => {
      throw new Error('The test did not expect the worker to run.');
    },
    ...overrides,
  };
}
