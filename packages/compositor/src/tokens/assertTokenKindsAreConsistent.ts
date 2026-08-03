import { collectIds } from '../consistency/collectIds.ts';
import { ConsistencyError } from '../consistency/ConsistencyError.ts';
import { createRequireKnown } from '../consistency/createRequireKnown.ts';
import { findDuplicateIds } from '../consistency/findDuplicateIds.ts';
import type { Violation } from '../consistency/Violation.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';

/** One way a set of token-kind declarations contradicts itself, located by a path into it. */
export type TokenKindViolation = Violation;

/** Raised when structurally valid token-kind declarations contradict themselves. */
export class TokenKindConsistencyError extends ConsistencyError {
  override readonly name = 'TokenKindConsistencyError';

  constructor(violations: ReadonlyArray<TokenKindViolation>) {
    super('Token kinds', violations);
  }
}

/**
 * Verifies what the structural schema cannot: that each pattern compiles and captures exactly one group, that no id
 * repeats, and that every referent names a kind in `kinds`.
 *
 * A pattern capturing no group leaves nothing to resolve, and one capturing several leaves the engine no way to tell
 * which capture is the name. Both are authoring mistakes a declaration can express and no rewrite could act on, so
 * they are caught here rather than at the first body that happens to match.
 *
 * Every violation is collected before throwing, so one run reports all of them. The order of the checks below is the
 * order they are reported in.
 */
export function assertTokenKindsAreConsistent(
  tokenKinds: ReadonlyArray<TokenKind>,
  kinds: ReadonlyArray<KindDescriptor>,
): void {
  const kindIds = collectIds(kinds);
  const violations: Array<Violation> = findDuplicateIds([['tokenKinds', tokenKinds]]);
  const requireKnown = createRequireKnown(violations);

  for (const [index, tokenKind] of tokenKinds.entries()) {
    const at = `tokenKinds[${index}]`;
    const groups = countCaptureGroups(tokenKind.pattern);
    if (groups === undefined) {
      violations.push({ path: `${at}.pattern`, message: 'is not a valid regular expression' });
    } else if (groups !== 1) {
      violations.push({ path: `${at}.pattern`, message: `captures ${groups} groups, but exactly one names the token` });
    }
    if (tokenKind.form === 'referent') {
      requireKnown(kindIds, tokenKind.artifactKindId, `${at}.artifactKindId`, 'kinds');
    }
  }

  if (violations.length > 0) {
    throw new TokenKindConsistencyError(violations);
  }
}

// region | Helpers

/**
 * Counts the capture groups `source` declares, or reports nothing when it does not compile.
 *
 * Alternating the pattern with an empty branch makes it match the empty string whatever it otherwise requires, so the
 * resulting array's length answers the question without a body to run it against.
 */
function countCaptureGroups(source: string): number | undefined {
  try {
    return (new RegExp(`${source}|`).exec('')?.length ?? 1) - 1;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
