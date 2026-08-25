import type { RdyKit } from '../kits/types.ts';

/**
 * Returns the ordered checklist names that positional arguments name, or every checklist name in kit
 * order where no argument was given.
 *
 * Arguments resolve left to right: a suite name expands to its constituent checklists in the order
 * the suite declares, and a checklist name passes through as itself. A repeated name keeps only its
 * first occurrence.
 */
export function resolveRequestedNames(requestedNames: string[], kit: RdyKit): string[] {
  if (requestedNames.length === 0) {
    return kit.checklists.map((c) => c.name);
  }

  const checklistNames = new Set(kit.checklists.map((c) => c.name));
  const suites = kit.suites ?? {};

  const unknownNames: string[] = [];
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const name of requestedNames) {
    const suiteEntries = Object.hasOwn(suites, name) ? suites[name] : undefined;
    if (suiteEntries !== undefined) {
      for (const entry of suiteEntries) {
        if (seen.has(entry)) {
          continue;
        }

        seen.add(entry);
        resolved.push(entry);
      }
    } else if (checklistNames.has(name)) {
      if (!seen.has(name)) {
        seen.add(name);
        resolved.push(name);
      }
    } else {
      unknownNames.push(name);
    }
  }

  if (unknownNames.length > 0) {
    const checklistList = [...checklistNames].join(', ');
    const suiteNames = Object.keys(suites);
    const suiteList = suiteNames.length > 0 ? `. Suites: ${suiteNames.join(', ')}` : '';
    throw new Error(`Unknown name(s): ${unknownNames.join(', ')}. Checklists: ${checklistList}${suiteList}`);
  }

  return resolved;
}
