import type { IdTable } from '../../consistency/findDuplicateIds.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';

/**
 * Collects the plan's id-keyed tables, in the order a violation against them is reported.
 *
 * Reordering reorders the reported violations, and dropping a table stops the duplicate-id check from covering it.
 */
export function collectIdTables(plan: Plan): ReadonlyArray<IdTable> {
  return [
    ['artifacts', plan.artifacts],
    ['kinds', plan.kinds],
    ['partials', plan.partials],
    ['sources', plan.sources],
    ['targets', plan.targets],
    ['tiers', plan.tiers],
    ['tokenKinds', plan.tokenKinds],
  ];
}
