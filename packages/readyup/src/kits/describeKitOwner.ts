import type { KitProvenance } from './KitProvenance.ts';

/**
 * Names the package publishing a kit, for the provenance that has one.
 *
 * Returns a clause to append after the kit's name, empty where no package published it.
 */
export function describeKitOwner(provenance: KitProvenance | undefined): string {
  return provenance?.kind === 'package' ? ` from ${provenance.packageName}` : '';
}
