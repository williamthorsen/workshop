import assert from 'node:assert';

import { runRdy } from '../../src/runRdy.ts';
import type { RdyKit, RdyResult } from '../../src/types.ts';

/**
 * The result whose claim contains `fragment`.
 *
 * Lets a test name a check by the part of the claim it cares about, rather than repeating a name that
 * carries a path the kit composed.
 */
export function pickResult(results: RdyResult[], fragment: string): RdyResult {
  const match = results.find((result) => result.name.includes(fragment));
  assert.ok(
    match !== undefined,
    `No result naming "${fragment}". Results: ${results.map((result) => result.name).join(' | ')}`,
  );
  return match;
}

/**
 * Runs one of a kit's checklists through the real runner and returns its results.
 *
 * Going through `runRdy` rather than calling the check functions directly is what makes skip conditions
 * and nesting behave in a test the way they will in a run.
 */
export async function runChecklist(kit: RdyKit, checklistName: string): Promise<RdyResult[]> {
  const checklist = kit.checklists.find((candidate) => candidate.name === checklistName);
  assert.ok(checklist !== undefined, `Kit has no checklist named "${checklistName}"`);

  const report = await runRdy(checklist, {
    ...(kit.defaultSeverity !== undefined && { defaultSeverity: kit.defaultSeverity }),
  });
  return report.results;
}
