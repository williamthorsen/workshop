import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { SourceResolution } from './foldSourceTiers.ts';
import { foldSourceTiers } from './foldSourceTiers.ts';
import type { LocateSourcePackagesOptions } from './locateSourcePackages.ts';
import { locateSourcePackages } from './locateSourcePackages.ts';

/**
 * Resolves the sources `config` declares, locating each on disk, in precedence order.
 *
 * The two halves are separately available, and a caller planning more than once wants them: `locateSourcePackages`
 * reads disk, `foldSourceTiers` is pure, and only the fold has to run again when a config changes. This composes them
 * for the caller resolving one config once.
 */
export async function resolveSources(
  config: CompositorConfig,
  options: LocateSourcePackagesOptions,
): Promise<SourceResolution> {
  return foldSourceTiers(config, await locateSourcePackages(config, options));
}
