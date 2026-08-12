import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

/**
 * Returns the engine's own version, which every plan records as the thing that produced it.
 *
 * Reads the manifest on each call.
 */
export function getEngineVersion(): string {
  return resolveSelfVersion(import.meta.url);
}
