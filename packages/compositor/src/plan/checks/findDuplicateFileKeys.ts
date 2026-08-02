import type { Violation } from '../../consistency/Violation.ts';
import type { Plan } from '../../schemas/plan-schema.ts';

/**
 * Reports each destination two file entries both claim.
 *
 * `files` carries no id because `(targetId, path)` is its natural key, so this is the id check applied to that pair: a
 * consumer keying files by destination silently drops one of a repeated pair, and the two can disagree on status,
 * ownership, and contributors.
 */
export function findDuplicateFileKeys(plan: Plan): Array<Violation> {
  const claimed = new Map<string, Set<string>>();
  const violations: Array<Violation> = [];

  for (const [index, file] of plan.files.entries()) {
    const paths = claimed.get(file.targetId) ?? new Set<string>();
    if (paths.has(file.path)) {
      violations.push({
        path: `files[${index}]`,
        message: `repeats the destination "${file.path}" within target "${file.targetId}"`,
      });
    }
    paths.add(file.path);
    claimed.set(file.targetId, paths);
  }

  return violations;
}
