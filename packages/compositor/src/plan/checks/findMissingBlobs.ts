import type { Violation } from '../../consistency/Violation.ts';
import type { Plan } from '../../schemas/plan-schema.ts';

/** Reports each file body a plan claiming complete content does not carry. */
export function findMissingBlobs(plan: Plan): Array<Violation> {
  if (plan.contentAvailability !== 'complete') {
    return [];
  }

  const carried = new Set(Object.keys(plan.blobs));
  const violations: Array<Violation> = [];
  for (const [index, file] of plan.files.entries()) {
    for (const side of ['current', 'planned'] as const) {
      const hash = side === 'current' ? file.current?.hash : file.planned?.hash;
      if (hash !== undefined && !carried.has(hash)) {
        violations.push({
          path: `files[${index}].${side}.hash`,
          message: `names "${hash}", which blobs does not carry`,
        });
      }
    }
  }
  return violations;
}
