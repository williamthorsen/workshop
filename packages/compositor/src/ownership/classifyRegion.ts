import { assertMarkersAreUsable, buildRegionPattern, countMarkerLines } from './region-matching.ts';
import type { RegionMarkers } from './RegionMarkers.ts';

/**
 * How a host's region stands.
 *
 * `malformed` carries its reason, because the caller composing a `FileBlock` from it knows only that something was
 * wrong, and a reader repairing the host needs to know what.
 */
export type RegionClassification =
  | { readonly state: 'absent' }
  | { readonly state: 'complete' }
  | { readonly state: 'malformed'; readonly reason: string };

/**
 * Reports whether `content` holds no markers, exactly one well-formed region, or a region no transform may touch.
 *
 * This is the gate every other region transform is defined in terms of, and the whole reason the family is safe. The
 * region pattern is lazy, so on a host carrying a stray marker above a well-formed region it matches from the stray
 * marker through the region's close marker, and replacing that span would discard every line between them. Classifying
 * such a host as malformed is what keeps any transform from running there.
 *
 * Malformed therefore covers an unmatched marker, a close marker preceding its open, and any duplication. Each either
 * destroys text on the next injection or leaves a second region permanently stale, so they are one category: the host
 * must be repaired rather than written to.
 */
export function classifyRegion(content: string, markers: RegionMarkers): RegionClassification {
  assertMarkersAreUsable(markers);

  const openCount = countMarkerLines(content, markers.open);
  const closeCount = countMarkerLines(content, markers.close);

  if (openCount === 0 && closeCount === 0) {
    return { state: 'absent' };
  }
  if (openCount !== 1 || closeCount !== 1) {
    return {
      state: 'malformed',
      reason:
        `The host carries ${describeCount(openCount, 'open marker')} and ${describeCount(closeCount, 'close marker')}, ` +
        'but a region is exactly one of each.',
    };
  }
  if (!buildRegionPattern(markers).test(content)) {
    return { state: 'malformed', reason: 'The host carries a close marker before its open marker.' };
  }
  return { state: 'complete' };
}

// region | Helpers

/** Renders a count and its noun for a reason a reader will act on: `no open marker`, `1 open marker`, `2 open markers`. */
function describeCount(count: number, noun: string): string {
  if (count === 0) {
    return `no ${noun}`;
  }
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

// endregion | Helpers
