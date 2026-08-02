import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import { findResolutionOrderViolations } from '../consistency/findResolutionOrderViolations.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { Plan } from '../schemas/plan-schema.ts';
import { collectIdTables } from './checks/collectIdTables.ts';
import { collectResolutions } from './checks/collectResolutions.ts';
import { findDanglingReferences } from './checks/findDanglingReferences.ts';
import { findDuplicateFileKeys } from './checks/findDuplicateFileKeys.ts';
import { findMisplacedPartialReferences } from './checks/findMisplacedPartialReferences.ts';
import { findMissingBlobs } from './checks/findMissingBlobs.ts';
import { findStatusDisagreements } from './checks/findStatusDisagreements.ts';

/** One way a plan contradicts itself, located by a path into the payload. */
export type PlanViolation = Violation;

/** Raised when a structurally valid plan contradicts itself. */
export class PlanConsistencyError extends ConsistencyError {
  override readonly name = 'PlanConsistencyError';

  constructor(violations: ReadonlyArray<PlanViolation>) {
    super('Plan', violations);
  }
}

/**
 * Verifies the invariants the structural schema does not carry: that every id reference resolves, that a plan claiming
 * complete content holds every body it references, and that each file's recorded status agrees with its two sides.
 *
 * Normalizing the payload into id-keyed tables is what makes a dangling reference expressible at all, so these checks
 * close the hazard that design introduced. They live here because a refinement inside the schema would be invisible to
 * `z.toJSONSchema`, leaving a generated JSON Schema accepting plans this package rejects.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertPlanIsConsistent(plan: Plan): void {
  const violations = [
    ...findDuplicateIds(collectIdTables(plan)),
    ...findDuplicateFileKeys(plan),
    ...findDanglingReferences(plan),
    ...findMisplacedPartialReferences(plan),
    ...findMissingBlobs(plan),
    ...findResolutionOrderViolations(collectResolutions(plan), plan.sources),
    ...findStatusDisagreements(plan),
  ];

  if (violations.length > 0) {
    throw new PlanConsistencyError(violations);
  }
}
