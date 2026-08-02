import type { Violation } from '../../consistency/Violation.ts';
import type { Catalog } from '../../schemas/resolution-schemas.ts';

/**
 * Violations for each entry naming one source more than once among its candidates.
 *
 * A source carries an artifact at one path, so it either wins resolution or loses it. Appearing twice would let one
 * source both shadow and be shadowed by itself, and would render a source explaining its own defeat.
 */
export function findRepeatedCandidateSources(catalog: Catalog): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [index, entry] of catalog.entries.entries()) {
    const seen = new Set([entry.resolution.winner.sourceId]);
    for (const [loserIndex, loser] of entry.resolution.shadowed.entries()) {
      if (seen.has(loser.sourceId)) {
        violations.push({
          path: `entries[${index}].resolution.shadowed[${loserIndex}].sourceId`,
          message: `repeats "${loser.sourceId}", which already carries this artifact`,
        });
      }
      seen.add(loser.sourceId);
    }
  }
  return violations;
}
