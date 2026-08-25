import type { Segment } from './expandTransclusions.ts';

/** Joins segments back into the body they were expanded from, which is what a rendered file contains. */
export function joinSegments(segments: ReadonlyArray<Segment>): string {
  return segments.flatMap((segment) => [...segment.lines]).join('\n');
}
