/** Region matching: the anchored line patterns every region transform reads a host through. */

import { escapeForRegExp } from '../portable/escapeForRegExp.ts';
import type { RegionMarkers } from './RegionMarkers.ts';

/**
 * Throws unless the markers can delimit a region at all: neither blank, neither spanning a line break, and not equal.
 *
 * These are faults in the declaration a consumer wrote rather than in the host, so they throw where a damaged host
 * blocks. A marker holding a line break would defeat the line anchoring every pattern here rests on, and equal markers
 * would have an open marker close the region it opened.
 */
export function assertMarkersAreUsable(markers: RegionMarkers): void {
  if (markers.open.trim() === '' || markers.close.trim() === '') {
    throw new Error('A region marker must not be blank.');
  }
  if (markers.open.includes('\n') || markers.close.includes('\n')) {
    throw new Error('A region marker must occupy a single line.');
  }
  if (markers.open.trim() === markers.close.trim()) {
    throw new Error(`Region markers must differ, but both read "${markers.open.trim()}".`);
  }
}

/**
 * Builds the pattern matching one whole region: its open marker line, its body as the sole capture, and its close
 * marker line.
 *
 * The body is lazy, so on a host containing a stray marker above a well-formed region the match runs from the stray
 * marker through the region's close marker. That is why `classifyRegion` gates every use of this pattern instead of
 * callers testing it for themselves.
 */
export function buildRegionPattern(markers: RegionMarkers): RegExp {
  return new RegExp(
    String.raw`${toMarkerLineSource(markers.open)}\n([\s\S]*?)${toMarkerLineSource(markers.close)}$`,
    'm',
  );
}

/** Counts the lines holding `marker` alone, which is the count a region's well-formedness is decided by. */
export function countMarkerLines(content: string, marker: string): number {
  return (content.match(new RegExp(`${toMarkerLineSource(marker)}$`, 'gm')) ?? []).length;
}

// region | Helpers

/**
 * Renders the pattern source matching a line that holds `marker` and nothing else.
 *
 * Surrounding horizontal whitespace is tolerated because a YAML host indents its markers inside the sequence they sit
 * in, and because a formatter that re-indents them must not make the region it already holds unfindable. Anchoring to
 * the line is what keeps a marker quoted mid-sentence from reading as one.
 */
function toMarkerLineSource(marker: string): string {
  return String.raw`^[ \t]*${escapeForRegExp(marker.trim())}[ \t]*`;
}

// endregion | Helpers
