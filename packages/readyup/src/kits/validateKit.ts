import type { RdyKit } from './types.ts';

/**
 * Checks the semantic invariants of a structurally valid kit, throwing a descriptive message on a
 * violation.
 *
 * Two rules hold: no suite name collides with a checklist name, and every entry in a suite names an
 * existing checklist.
 */
export function validateKit(kit: RdyKit): void {
  const { suites } = kit;
  if (suites === undefined) return;

  const checklistNames = new Set(kit.checklists.map((c) => c.name));

  const collisions = Object.keys(suites).filter((name) => checklistNames.has(name));
  if (collisions.length > 0) {
    throw new Error(
      `Suite name(s) collide with checklist name(s): ${collisions.join(', ')}. Suite names and checklist names must be unique across both pools.`,
    );
  }

  const missingBySource: string[] = [];
  for (const [suiteName, entries] of Object.entries(suites)) {
    for (const entry of entries) {
      if (!checklistNames.has(entry)) {
        missingBySource.push(`suite "${suiteName}" references unknown checklist "${entry}"`);
      }
    }
  }
  if (missingBySource.length > 0) {
    throw new Error(
      `Invalid suite references: ${missingBySource.join('; ')}. Available checklists: ${[...checklistNames].join(', ')}`,
    );
  }
}
