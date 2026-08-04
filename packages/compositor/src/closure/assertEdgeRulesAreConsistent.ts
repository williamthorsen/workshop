import { collectIds } from '../consistency/collectIds.ts';
import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { createRequireKnown } from '../consistency/createRequireKnown.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { EdgeRule, KindKeys } from '../schemas/edge-rule-schemas.ts';

/** One way a set of edge-rule declarations contradicts itself, located by a path into it. */
export type EdgeRuleViolation = Violation;

/** Raised when structurally valid edge-rule declarations contradict themselves. */
export class EdgeRuleConsistencyError extends ConsistencyError {
  override readonly name = 'EdgeRuleConsistencyError';

  constructor(violations: ReadonlyArray<EdgeRuleViolation>) {
    super('Edge rules', violations);
  }
}

/**
 * Verifies what the structural schema cannot: that every kind a declaration names is one the catalog carries, and that
 * no two rules claim one key of one kind.
 *
 * Both faults are otherwise silent. A rule keyed to a kind no catalog entry has is read for no artifact, and a key two
 * rules claim has one of them shadowed, so either way the closure comes out smaller with nothing to say why.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertEdgeRulesAreConsistent(
  rules: ReadonlyArray<EdgeRule>,
  kindKeys: KindKeys,
  kinds: ReadonlyArray<KindDescriptor>,
): void {
  const kindIds = collectIds(kinds);
  const violations: Array<Violation> = findRepeatedClaims(rules);
  const requireKnown = createRequireKnown(violations);

  for (const [index, rule] of rules.entries()) {
    const at = `rules[${index}]`;
    requireKnown(kindIds, rule.kindId, `${at}.kindId`, 'kinds');
    if (rule.form === 'flat') {
      requireKnown(kindIds, rule.targetKindId, `${at}.targetKindId`, 'kinds');
    }
  }

  for (const [key, kindId] of Object.entries(kindKeys)) {
    requireKnown(kindIds, kindId, `kindKeys.${key}`, 'kinds');
  }

  if (violations.length > 0) {
    throw new EdgeRuleConsistencyError(violations);
  }
}

// region | Helpers

/** Reports each key claimed twice for one kind, where whichever rule loses is never read. */
function findRepeatedClaims(rules: ReadonlyArray<EdgeRule>): Array<Violation> {
  const seen = new Set<string>();
  const repeated = new Map<string, Violation>();
  for (const rule of rules) {
    const claim = JSON.stringify([rule.kindId, rule.key]);
    if (seen.has(claim)) {
      repeated.set(claim, {
        path: 'rules',
        message: `claim "${rule.key}" of kind "${rule.kindId}" more than once`,
      });
    }
    seen.add(claim);
  }
  return repeated.values().toArray();
}

// endregion | Helpers
