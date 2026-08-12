import { describeError } from '@williamthorsen/toolbelt.errors';

import { usageError } from '../errors/RdyError.ts';
import type { RdyChecklist, RdyKit, RdyStagedChecklist } from '../kits/types.ts';
import { resolveRequestedNames } from './resolveRequestedNames.ts';

/** Resolves a kit's requested checklist names to the checklists themselves, in requested order. */
export function selectChecklists(kit: RdyKit, checklistFilter: string[]): Array<RdyChecklist | RdyStagedChecklist> {
  let resolvedNames: string[];
  try {
    resolvedNames = resolveRequestedNames(checklistFilter, kit);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }

  const checklistByName = new Map(kit.checklists.map((c) => [c.name, c]));
  return resolvedNames.flatMap((name) => {
    const checklist = checklistByName.get(name);
    return checklist !== undefined ? [checklist] : [];
  });
}
