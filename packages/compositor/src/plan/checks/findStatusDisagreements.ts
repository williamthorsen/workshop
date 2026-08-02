import type { Violation } from '../../consistency/Violation.ts';
import type { DiffStatus } from '../../schemas/common.ts';
import type { FileEntry } from '../../schemas/file-schemas.ts';
import type { Plan } from '../../schemas/plan-schema.ts';

/** Violations for each file whose recorded status disagrees with the sides it carries. */
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
    if (file.blocked !== undefined && file.status === 'unchanged') {
      violations.push({
        path: `files[${index}].blocked`,
        message: 'is set on a file that would not be written anyway',
      });
    }
  }
  return violations;
}

// region | Helpers

/** The status a file's two sides describe, or `undefined` when it carries neither. */
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
