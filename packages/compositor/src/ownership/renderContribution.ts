import { assertMarkersAreUsable } from './region-matching.ts';
import type { RegionMarkers } from './RegionMarkers.ts';

/**
 * Wraps `body` in its markers, with no surrounding newlines; an empty body yields adjacent marker lines.
 *
 * This is what populates `ArtifactContribution.marker`: several artifacts aggregate into one region, each behind its
 * own pair, which is what makes a single contributor's bytes locatable within the whole. A region and a contribution
 * render identically -- both are a body between two marker lines -- so nesting one inside the other needs no second
 * renderer, and `injectRegion` calls this one.
 *
 * Only trailing newlines are trimmed. Leading whitespace is a body's own, since a contribution to a YAML host is
 * indented and losing that indentation would change what the host means.
 */
export function renderContribution(markers: RegionMarkers, body: string): string {
  assertMarkersAreUsable(markers);

  const trimmed = body.replace(/\n+$/, '');
  return trimmed === '' ? `${markers.open}\n${markers.close}` : `${markers.open}\n${trimmed}\n${markers.close}`;
}
