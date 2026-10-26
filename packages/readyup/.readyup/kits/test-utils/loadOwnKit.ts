import { vi } from 'vitest';

import type { RdyKit } from '../../../src/kits/types.ts';

/** Names of the kits that this package publishes. */
export type OwnKitName = 'default' | 'publishing';

/**
 * Loads one of the package's own kits from source, evaluated against the current working directory.
 *
 * Discards the cached module first, so that each load evaluates the kit afresh, as a new `rdy` process
 * would, and a check that the kit builds when it loads reflects the fixture that the test has moved to.
 */
export async function loadOwnKit(name: OwnKitName): Promise<RdyKit> {
  vi.resetModules();
  const imported = name === 'default' ? await import('../default.ts') : await import('../publishing.ts');
  return imported.default;
}
