import { describe, expect, it } from 'vitest';

import { findMarkerFault } from '../region-matching.ts';

describe(findMarkerFault, () => {
  it('returns nothing for markers that can delimit a region', () => {
    expect(findMarkerFault({ open: '<!-- start -->', close: '<!-- end -->' })).toBeUndefined();
  });

  it('if a marker is blank, says so', () => {
    expect(findMarkerFault({ open: '  ', close: '<!-- end -->' })).toBe('A region marker must not be blank.');
  });

  it('if a marker spans a line break, says so', () => {
    expect(findMarkerFault({ open: '<!-- start\n-->', close: '<!-- end -->' })).toBe(
      'A region marker must occupy a single line.',
    );
  });

  it('if the markers are equal once trimmed, names what both read', () => {
    expect(findMarkerFault({ open: ' <!-- mark -->', close: '<!-- mark --> ' })).toBe(
      'Region markers must differ, but both read "<!-- mark -->".',
    );
  });
});
