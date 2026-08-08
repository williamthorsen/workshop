import { getSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

/**
 * Returns the engine's own version, which every plan records as the thing that produced it.
 *
 * Read from the manifest on each call rather than declared here, so a version bump cannot leave the two disagreeing.
 */
export function getEngineVersion(): string {
  return getSelfVersion(import.meta.url);
}
