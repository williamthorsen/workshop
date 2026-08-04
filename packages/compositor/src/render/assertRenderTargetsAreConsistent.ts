import { collectIds } from '../consistency/collectIds.ts';
import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { countCaptureGroups } from '../consistency/countCaptureGroups.ts';
import { createRequireKnown } from '../consistency/createRequireKnown.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';

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
 * every deployment names a kind in `kinds`, and that each link grammar compiles and captures exactly one group.
 *
 * A stage declared twice would run twice, and a kind deployed twice would put one artifact in two places; both are
 * authoring mistakes a declaration can express and no render could act on. Checking them here rather than at the first
 * body that happens to reach the stage is what makes a bad declaration a validation result rather than a surprise
 * part-way through a plan.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertRenderTargetsAreConsistent(
  targets: ReadonlyArray<RenderTarget>,
  kinds: ReadonlyArray<KindDescriptor>,
): void {
  const kindIds = collectIds(kinds);
  const violations: Array<Violation> = findDuplicateIds([['targets', targets]]);
  const requireKnown = createRequireKnown(violations);

  for (const [index, target] of targets.entries()) {
    const at = `targets[${index}]`;
    collectRepeats(
      target.deployments.map((deployment) => deployment.kindId),
      `${at}.deployments`,
      'deploys',
      violations,
    );
    collectRepeats(
      target.stages.map((stage) => stage.kind),
      `${at}.stages`,
      'runs',
      violations,
    );

    for (const [position, deployment] of target.deployments.entries()) {
      requireKnown(kindIds, deployment.kindId, `${at}.deployments[${position}].kindId`, 'kinds');
    }

    for (const [position, stage] of target.stages.entries()) {
      if (stage.kind !== 'links') {
        continue;
      }
      const groups = countCaptureGroups(stage.pattern);
      const path = `${at}.stages[${position}].pattern`;
      if (groups === undefined) {
        violations.push({ path, message: 'is not a valid regular expression' });
      } else if (groups !== 1) {
        violations.push({ path, message: `captures ${groups} groups, but exactly one names the link target` });
      }
    }
  }

  if (violations.length > 0) {
    throw new RenderTargetConsistencyError(violations);
  }
}

// region | Helpers

/** Reports each value `names` carries twice, appending to `violations` in the order the repeats first appear. */
function collectRepeats(names: ReadonlyArray<string>, path: string, verb: string, violations: Array<Violation>): void {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      repeated.add(name);
    }
    seen.add(name);
  }
  for (const name of repeated) {
    violations.push({ path, message: `${verb} "${name}" more than once` });
  }
}

// endregion | Helpers
