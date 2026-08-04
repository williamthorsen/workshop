import type { Violation } from '../../consistency/Violation.ts';
import type { Closure } from '../../schemas/closure-schemas.ts';

/**
 * Reports each diagnostic carrying a cycle it could not have found.
 *
 * A cycle is the one diagnostic whose fault runs through several artifacts, so it is the only one with members to name.
 * A `misplaced-key` carrying them would offer a reader a path through a graph that had nothing to do with the fault.
 */
export function findMisplacedCycles(closure: Closure): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [index, diagnostic] of closure.diagnostics.entries()) {
    if (diagnostic.cycle !== undefined && diagnostic.code !== 'dependency-cycle') {
      violations.push({
        path: `diagnostics[${index}].cycle`,
        message: `is set on a "${diagnostic.code}" diagnostic, and only a dependency cycle runs through artifacts`,
      });
    }
  }
  return violations;
}
