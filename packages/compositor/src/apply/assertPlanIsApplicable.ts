import path from 'node:path';

import type { Violation } from '../consistency/Violation.ts';
import type { Plan } from '../schemas/plan-schemas.ts';
import { UnapplicablePlanError } from './UnapplicablePlanError.ts';

/**
 * Refuses a plan this engine will not write, before a single destination is touched.
 *
 * Checking up front is the whole point: a refusal met part-way through the walk would leave a destination half
 * applied, some of its files written against a plan the rest of them cannot apply.
 *
 * Three refusals. A plan containing only part of its content names bodies no `blobs` table holds. A file whose target
 * the plan does not contain has no root to resolve against. A path that is absolute or climbs out of the target names a
 * destination outside the tree the plan describes, and apply writes and deletes, so that one is the refusal whose
 * absence costs a file somebody else owns.
 *
 * The engine composes no escaping path, so a plan containing one came from elsewhere, which is the case apply is built
 * to be safe under: a consumer applies a payload it was handed. Entries ownership is not among the refusals: an
 * entries host is written whole exactly as a region host is, under the drift guard that protects every destination.
 *
 * Every refusal is collected, so one run reports all of them.
 */
export function assertPlanIsApplicable(plan: Plan): void {
  const refusals: Array<Violation> = [];
  const targetIds = new Set(plan.targets.map(({ id }) => id));

  if (plan.contentAvailability !== 'complete') {
    refusals.push({
      path: 'contentAvailability',
      message: `is "${plan.contentAvailability}", so the plan does not contain every body it would write.`,
    });
  }

  for (const [index, file] of plan.files.entries()) {
    if (!targetIds.has(file.targetId)) {
      refusals.push({
        path: `files[${index}].targetId`,
        message: `is "${file.targetId}", which the plan's targets do not contain, so no root resolves for it.`,
      });
    }
    if (!staysInsideRoot(file.path)) {
      refusals.push({
        path: `files[${index}].path`,
        message: `is "${file.path}", which does not name a destination inside the target's root.`,
      });
    }
    if (file.planned !== undefined && plan.blobs[file.planned.hash] === undefined) {
      refusals.push({
        path: `files[${index}].planned`,
        message: `names body "${file.planned.hash}", which the plan's blobs do not hold.`,
      });
    }
  }

  if (refusals.length > 0) {
    throw new UnapplicablePlanError(refusals);
  }
}

// region | Helpers

/** Reports whether a path names a destination within the target's root, which is the whole of what apply may touch. */
function staysInsideRoot(filePath: string): boolean {
  if (filePath === '' || path.posix.isAbsolute(filePath)) {
    return false;
  }

  const normalized = path.posix.normalize(filePath);
  return normalized !== '..' && !normalized.startsWith('../');
}

// endregion | Helpers
