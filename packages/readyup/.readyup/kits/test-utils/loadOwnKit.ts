import { vi } from 'vitest';

import type { RdyKit } from '../../../src/kits/types.ts';

/** Names of the kits this package publishes. */
export type OwnKitName = 'default' | 'publishing';

/**
 * Loads one of the package's own kits from source, evaluated against the current working directory.
 *
 * Both kits build their checks when the module is evaluated, reading the manifest and the kit directory
 * to name one check per kit rather than burying every kit in one check's detail. A test that has moved
 * to a new fixture therefore has to discard the cached module to see it.
 */
export async function loadOwnKit(name: OwnKitName): Promise<RdyKit> {
  vi.resetModules();
  const imported = name === 'default' ? await import('../default.ts') : await import('../publishing.ts');
  return imported.default;
}
