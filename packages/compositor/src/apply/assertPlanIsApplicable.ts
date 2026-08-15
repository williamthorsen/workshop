import type { Violation } from '../consistency/Violation.ts';
import type { Plan } from '../schemas/plan-schemas.ts';
import { UnapplicablePlanError } from './UnapplicablePlanError.ts';

/**
 * Refuses a plan this engine will not write, before a single destination is touched.
 *
 * Checking up front is the whole point: a refusal met part-way through the walk would leave a destination half
 * applied, some of its files written against a plan the rest of them cannot carry out.
 *
 * Three refusals. A plan carrying only part of its content names bodies no `blobs` table holds. A file whose target
 * the plan does not carry has no root to resolve against. And entries ownership -- individual items inside a
 * structured document another tool also writes -- would be written whole here, taking that tool's items with it; the
 * engine composes none today, so a plan carrying one came from elsewhere.
 *
 * Every refusal is collected, so one run reports all of them.
 */
export function assertPlanIsApplicable(plan: Plan): void {
  const refusals: Array<Violation> = [];
  const targetIds = new Set(plan.targets.map(({ id }) => id));

  if (plan.contentAvailability !== 'complete') {
    refusals.push({
      path: 'contentAvailability',
      message: `is "${plan.contentAvailability}", so the plan does not carry every body it would write.`,
    });
  }

  for (const [index, file] of plan.files.entries()) {
    if (!targetIds.has(file.targetId)) {
      refusals.push({
        path: `files[${index}].targetId`,
        message: `is "${file.targetId}", which the plan's targets do not carry, so no root resolves for it.`,
      });
    }
    if (file.ownership.kind === 'entries') {
      refusals.push({
        path: `files[${index}].ownership`,
        message: 'is entries ownership, which this engine writes no plan for and would clobber whole.',
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
