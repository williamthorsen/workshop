import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import { findMisplacedPartialReferences } from '../consistency/findMisplacedPartialReferences.ts';
import { findResolutionOrderViolations } from '../consistency/findResolutionOrderViolations.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { Closure } from '../schemas/closure-schemas.ts';
import { collectIdTables } from './checks/collectIdTables.ts';
import { collectResolutions } from './checks/collectResolutions.ts';
import { findDanglingReferences } from './checks/findDanglingReferences.ts';
import { findMisplacedCycles } from './checks/findMisplacedCycles.ts';

/** One way a closure contradicts itself, located by a path into the payload. */
export type ClosureViolation = Violation;

/** Raised when a structurally valid closure contradicts itself. */
export class ClosureConsistencyError extends ConsistencyError {
  override readonly name = 'ClosureConsistencyError';

  constructor(violations: ReadonlyArray<ClosureViolation>) {
    super('Closure', violations);
  }
}

/**
 * Verifies the invariants the structural schema does not carry: that every id reference resolves, that a partial is
 * named only by the edge origin read from one, and that shadowed candidates descend in source precedence order.
 *
 * A closure `computeClosure` produced satisfies all of it by construction, so the walk does not pay for the checks.
 * This is for a closure that arrived as data, which is the case a reader rendering a payload it did not compute is in.
 *
 * A schema refinement would be invisible to `z.toJSONSchema`, so a generated JSON Schema would accept closures this
 * package rejects.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertClosureIsConsistent(closure: Closure): void {
  const violations = [
    ...findDuplicateIds(collectIdTables(closure)),
    ...findDanglingReferences(closure),
    ...findMisplacedPartialReferences(closure),
    ...findMisplacedCycles(closure),
    ...findResolutionOrderViolations(collectResolutions(closure), closure.sources),
  ];

  if (violations.length > 0) {
    throw new ClosureConsistencyError(violations);
  }
}
