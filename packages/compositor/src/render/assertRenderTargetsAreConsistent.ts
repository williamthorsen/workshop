import { collectIds } from '../consistency/collectIds.ts';
import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import { findDeploymentFaults } from './checks/findDeploymentFaults.ts';
import { findOwnedItemsFaults } from './checks/findOwnedItemsFaults.ts';
import { findRepeatedDeclarations } from './checks/findRepeatedDeclarations.ts';
import { findStageFaults } from './checks/findStageFaults.ts';

/** One way a set of render-target declarations contradicts itself, located by a path into it. */
export type RenderTargetViolation = Violation;

/** Raised when structurally valid render-target declarations contradict themselves. */
export class RenderTargetConsistencyError extends ConsistencyError {
  override readonly name = 'RenderTargetConsistencyError';

  constructor(violations: ReadonlyArray<RenderTargetViolation>) {
    super('Render targets', violations);
  }
}

/**
 * Verifies what the structural schema cannot: that no target repeats an id, a stage kind, or a deployed kind, that
 * every deployment names a kind in `kinds`, that a region deployment's markers and host can do their jobs, that each
 * link grammar compiles and captures exactly one group, that an inlay stage's two marker templates can delimit a span
 * and name what they stand for with a reshape rule that compiles, and that no owned-items declaration contends for a
 * collection another already owns or nests inside, disagrees with a sibling about its host's format, sits on a region
 * host, or has an item its sentinel could never write or find again.
 *
 * Checking the declarations here rather than at the first body that happens to reach a stage is what makes a bad
 * declaration a validation result rather than a surprise part-way through a plan. The marker checks are the same
 * bargain against transforms that would otherwise throw at the first host they were run over.
 *
 * Every violation is collected before throwing, so one run reports all of them. Violations are reported target by
 * target, and within a target in the order of the checks below.
 */
export function assertRenderTargetsAreConsistent(
  targets: ReadonlyArray<RenderTarget>,
  kinds: ReadonlyArray<KindDescriptor>,
): void {
  const kindIds = collectIds(kinds);
  const violations: Array<Violation> = [
    ...findDuplicateIds([['targets', targets]]),
    ...targets.flatMap((target, index) => {
      const at = `targets[${index}]`;
      return [
        ...findRepeatedDeclarations(target, at),
        ...findDeploymentFaults(target, at, kindIds),
        ...findOwnedItemsFaults(target, at),
        ...findStageFaults(target, at),
      ];
    }),
  ];

  if (violations.length > 0) {
    throw new RenderTargetConsistencyError(violations);
  }
}
