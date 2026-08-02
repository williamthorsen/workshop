import { collectIds } from '../../consistency/collectIds.ts';
import { createRequireKnown } from '../../consistency/createRequireKnown.ts';
import type { Violation } from '../../consistency/Violation.ts';
import type { Catalog } from '../../schemas/resolution-schemas.ts';

/** Violations for each id reference that names no entry in the table it points at. */
export function findDanglingReferences(catalog: Catalog): Array<Violation> {
  const kindIds = collectIds(catalog.kinds);
  const sourceIds = collectIds(catalog.sources);

  const violations: Array<Violation> = [];
  const requireKnown = createRequireKnown(violations);

  for (const [index, entry] of catalog.entries.entries()) {
    const at = `entries[${index}]`;
    requireKnown(kindIds, entry.kindId, `${at}.kindId`, 'kinds');
    requireKnown(sourceIds, entry.resolution.winner.sourceId, `${at}.resolution.winner.sourceId`, 'sources');
    for (const [loserIndex, loser] of entry.resolution.shadowed.entries()) {
      const path = `${at}.resolution.shadowed[${loserIndex}].sourceId`;
      requireKnown(sourceIds, loser.sourceId, path, 'sources');
    }
  }

  return violations;
}
