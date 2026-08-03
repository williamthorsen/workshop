import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import { findResolutionOrderViolations } from '../consistency/findResolutionOrderViolations.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { Catalog } from '../schemas/catalog-schemas.ts';
import { collectIdTables } from './checks/collectIdTables.ts';
import { collectResolutions } from './checks/collectResolutions.ts';
import { findDanglingReferences } from './checks/findDanglingReferences.ts';
import { findIdDisagreements } from './checks/findIdDisagreements.ts';
import { findRepeatedCandidateSources } from './checks/findRepeatedCandidateSources.ts';

/** One way a catalog contradicts itself, located by a path into the payload. */
export type CatalogViolation = Violation;

/** Raised when a structurally valid catalog contradicts itself. */
export class CatalogConsistencyError extends ConsistencyError {
  override readonly name = 'CatalogConsistencyError';

  constructor(violations: ReadonlyArray<CatalogViolation>) {
    super('Catalog', violations);
  }
}

/**
 * Verifies the invariants the structural schema does not carry: that every id reference resolves, that each entry's id
 * agrees with the kind and slug it names, and that shadowed candidates descend in source precedence order.
 *
 * A catalog the engine produced satisfies these by construction, so `resolveCatalog` does not call this on its own
 * output. It is for a catalog that arrived as data, which is the case a reader rendering a payload it did not compute
 * is in.
 *
 * The checks live here rather than as schema refinements because a refinement would be invisible to `z.toJSONSchema`,
 * leaving a generated JSON Schema accepting catalogs this package rejects.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertCatalogIsConsistent(catalog: Catalog): void {
  const violations = [
    ...findDuplicateIds(collectIdTables(catalog)),
    ...findDanglingReferences(catalog),
    ...findIdDisagreements(catalog),
    ...findRepeatedCandidateSources(catalog),
    ...findResolutionOrderViolations(collectResolutions(catalog), catalog.sources),
  ];

  if (violations.length > 0) {
    throw new CatalogConsistencyError(violations);
  }
}
