import type { RdyKit } from './types.ts';

/**
 * Check semantic invariants on a structurally valid kit.
 *
 * Enforces two rules: (1) no suite name may collide with a checklist name,
 * and (2) every entry in a suite must reference an existing checklist name.
 * Throws on violation with a descriptive message.
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
