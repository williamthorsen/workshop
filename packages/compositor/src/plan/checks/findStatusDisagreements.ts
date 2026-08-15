import type { Violation } from '../../consistency/Violation.ts';
import type { FileEntry } from '../../schemas/file-schemas.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';
import type { DiffStatus } from '../../schemas/scalar-schemas.ts';

/**
 * Reports each file whose recorded status disagrees with the sides it carries.
 *
 * A block on an unchanged file is not one of those disagreements. A destination whose planned content could not be
 * computed -- a render that failed, a region host whose markers are damaged -- stands at the body it holds, and the
 * block is the whole record of why nothing will be written there.
 */
export function findStatusDisagreements(plan: Plan): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [index, file] of plan.files.entries()) {
    const implied = implyStatus(file);
    if (implied === undefined) {
      violations.push({ path: `files[${index}]`, message: 'carries neither a current nor a planned side' });
    } else if (implied !== file.status) {
      violations.push({
        path: `files[${index}].status`,
        message: `is "${file.status}", but its sides describe "${implied}"`,
      });
    }
  }
  return violations;
}

// region | Helpers

/** Derives the status a file's two sides describe, or `undefined` when it carries neither. */
function implyStatus(file: FileEntry): DiffStatus | undefined {
  if (file.current === undefined) {
    return file.planned === undefined ? undefined : 'added';
  }
  if (file.planned === undefined) {
    return 'removed';
  }
  return file.current.hash === file.planned.hash ? 'unchanged' : 'changed';
}

// endregion | Helpers
