import { buildTsconfigChainEntry, type TsconfigChainEntry } from '../check-utils/tsconfig.ts';

/** Path reported by a fixture when the caller names none. */
const DEFAULT_PATH = 'tsconfig.json';

/**
 * Builds a `TsconfigChainEntry` fixture, filling every field left out by the caller.
 *
 * `compilerOptions` is derived from `config` by the code that `readTsconfigChain` uses, so a fixture whose config
 * declares compiler options reports them as the reader would. Overrides apply after the derivation, so a test can
 * still state a shape that the reader would not produce.
 */
export function makeTsconfigChainEntry(overrides: Partial<TsconfigChainEntry> = {}): TsconfigChainEntry {
  const derived = buildTsconfigChainEntry(overrides.config ?? {}, overrides.path ?? DEFAULT_PATH, overrides.specifier);

  return { ...derived, ...overrides };
}
