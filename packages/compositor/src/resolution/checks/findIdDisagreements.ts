import type { Violation } from '../../consistency/Violation.ts';
import type { Catalog } from '../../schemas/resolution-schemas.ts';
import { composeArtifactId } from '../composeArtifactId.ts';

/**
 * Reports each entry whose id is not composed from the kind and slug beside it.
 *
 * The composition is what lets a plan artifact's id address a catalog entry, so an entry that departs from it is
 * unreachable from the plan describing the same artifact. Checking it also rules out two entries describing one
 * artifact, which unique ids alone would allow.
 */
export function findIdDisagreements(catalog: Catalog): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [index, entry] of catalog.entries.entries()) {
    const expected = composeArtifactId(entry.kindId, entry.slug);
    if (entry.id !== expected) {
      violations.push({
        path: `entries[${index}].id`,
        message: `is "${entry.id}", and the kind and slug beside it compose "${expected}"`,
      });
    }
  }
  return violations;
}
