import type { ArtifactResolution } from '../schemas/artifact-resolution-schemas.ts';
import type { Violation } from './Violation.ts';

/** One resolution to check, with the path prefix a violation against it is reported under. */
export interface ResolutionAt {
  readonly basePath: string;
  readonly resolution: ArtifactResolution | undefined;
}

/**
 * Reports each resolution whose candidates contradict source precedence.
 *
 * `sources` runs highest precedence first, so a winner must outrank every candidate it shadowed and the losers must
 * descend from there. Nothing else validates this: the schema cannot express an ordering, and a payload listing losers
 * arbitrarily would otherwise render "shadowing Z" from data no check had looked at.
 *
 * Shared by the plan and catalog assertions, which contain the same resolution sub-shape and differ only in the
 * reported path, which `basePath` supplies.
 *
 * A candidate naming an unknown source is skipped here, because each caller reports the dangling reference itself. A
 * repeated source id ranks at its first occurrence, which is the one that would win resolution; the repeat itself is
 * reported by each caller's duplicate check rather than cascading into every resolution that names it.
 */
export function findResolutionOrderViolations(
  entries: ReadonlyArray<ResolutionAt>,
  sources: ReadonlyArray<{ id: string }>,
): Array<Violation> {
  const precedence = buildSourcePrecedence(sources);
  const violations: Array<Violation> = [];

  for (const { basePath, resolution } of entries) {
    if (resolution === undefined) {
      continue;
    }

    // The pair always names one source: `outrankedBy` is the source at `outrankingIndex`, so a violation reports the
    // source it was actually compared against.
    let outrankedBy = resolution.winner.sourceId;
    let outrankingIndex = precedence.get(outrankedBy);
    for (const [loserIndex, loser] of resolution.shadowed.entries()) {
      const loserIndexInSources = precedence.get(loser.sourceId);
      if (loserIndexInSources === undefined || outrankingIndex === undefined) {
        continue;
      }
      if (loserIndexInSources > outrankingIndex) {
        outrankedBy = loser.sourceId;
        outrankingIndex = loserIndexInSources;
        continue;
      }
      violations.push({
        path: `${basePath}.shadowed[${loserIndex}].sourceId`,
        message: `names "${loser.sourceId}", which does not follow "${outrankedBy}" in source precedence order`,
      });
    }
  }

  return violations;
}

// region | Helpers

/** Maps each source id to its rank, a repeated id taking the rank of its first occurrence. */
function buildSourcePrecedence(sources: ReadonlyArray<{ id: string }>): ReadonlyMap<string, number> {
  const precedence = new Map<string, number>();
  for (const [index, source] of sources.entries()) {
    if (!precedence.has(source.id)) {
      precedence.set(source.id, index);
    }
  }
  return precedence;
}

// endregion | Helpers
