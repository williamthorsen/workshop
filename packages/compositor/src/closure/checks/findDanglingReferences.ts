import { collectIds } from '../../consistency/collectIds.ts';
import { createRequireKnown } from '../../consistency/createRequireKnown.ts';
import { findGraphDanglingReferences } from '../../consistency/findGraphDanglingReferences.ts';
import type { Violation } from '../../consistency/Violation.ts';
import type { Closure } from '../../schemas/closure-schemas.ts';

/**
 * Reports each id reference that names no entry in the table it points at.
 *
 * The artifact and partial tables are checked by the shared graph check, which a plan calls too; what is left here is
 * the diagnostics, which a closure alone contains. A diagnostic pointing at an artifact the closure dropped would leave
 * a reader with a fault and nothing to attach it to.
 */
export function findDanglingReferences(closure: Closure): Array<Violation> {
  const violations: Array<Violation> = findGraphDanglingReferences(closure);
  const artifactIds = collectIds(closure.artifacts);
  const requireKnown = createRequireKnown(violations);

  for (const [index, diagnostic] of closure.diagnostics.entries()) {
    const at = `diagnostics[${index}]`;
    requireKnown(artifactIds, diagnostic.at.artifactId, `${at}.at.artifactId`, 'artifacts');
    const cycle = diagnostic.cycle ?? [];
    for (const [memberIndex, member] of cycle.entries()) {
      requireKnown(artifactIds, member, `${at}.cycle[${memberIndex}]`, 'artifacts');
    }
  }

  return violations;
}
