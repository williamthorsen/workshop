import type { RdyKit } from './types.ts';

/**
 * Resolve positional arguments against checklist names and suite names.
 *
 * Processes args left-to-right: suite names expand to their constituent checklists in
 * suite-defined order; checklist names pass through directly. Duplicates are removed by
 * first occurrence. Returns the ordered list of checklist names to run.
 *
 * When no names are given, returns all checklist names in kit order.
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
    const suiteEntries = suites[name];
    if (suiteEntries !== undefined) {
      for (const entry of suiteEntries) {
        if (!seen.has(entry)) {
          seen.add(entry);
          resolved.push(entry);
        }
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
