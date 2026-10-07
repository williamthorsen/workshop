import { formatRepositoryLabel, type KitProvenance } from './KitProvenance.ts';

/**
 * Names the package or repository publishing a kit, for the provenance that has one.
 *
 * Returns a clause to append after the kit's name, empty when neither a package nor a repository published it.
 */
export function describeKitOwner(provenance: KitProvenance | undefined): string {
  if (provenance?.kind === 'package') return ` from ${provenance.packageName}`;
  if (provenance?.kind === 'repository') return ` from ${formatRepositoryLabel(provenance)}`;
  return '';
}
