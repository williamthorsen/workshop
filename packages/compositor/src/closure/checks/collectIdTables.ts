import type { IdTable } from '../../consistency/findDuplicateIds.ts';
import type { Closure } from '../../schemas/closure-schemas.ts';

/**
 * Collects the closure's id-keyed tables, in the order a violation against them is reported.
 *
 * Reordering reorders the reported violations, and dropping a table stops the duplicate-id check from covering it.
 */
export function collectIdTables(closure: Closure): ReadonlyArray<IdTable> {
  return [
    ['artifacts', closure.artifacts],
    ['kinds', closure.kinds],
    ['partials', closure.partials],
    ['sources', closure.sources],
    ['tiers', closure.tiers],
  ];
}
