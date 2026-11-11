import type { Violation } from '../../consistency/Violation.ts';
import { findMarkerFault } from '../../ownership/region-matching.ts';
import type { MarkerPair } from '../../schemas/render-target-schemas.ts';

/** Reports markers that could not delimit a span at all, restating the reason as a located violation. */
export function findMarkerFaults(markers: MarkerPair, path: string): Array<Violation> {
  const reason = findMarkerFault(markers);
  return reason === undefined ? [] : [{ path, message: reason }];
}
