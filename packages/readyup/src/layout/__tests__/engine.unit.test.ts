import { afterEach, describe, expect, it } from 'vitest';

import { getColor, getLayout, setColor, setStyle } from '../engine.ts';
import { makeCounts } from '../test-utils/summary-fixtures.ts';

/** Matches the start of an SGR escape sequence. */
const ESCAPE = '\u001B[';

const COUNTS = makeCounts({ passed: 1 });

afterEach(() => {
  setColor(false);
  setStyle('rich');
});

describe('colour selection', () => {
  it('leaves rich output uncoloured until colour is selected', () => {
    expect(getColor()).toBe(false);
    expect(getLayout().formatCounts(COUNTS)).toBe('1 passed');
  });

  it('colours rich output whichever of style and colour is selected first', () => {
    setColor(true);
    setStyle('rich');
    const colourFirst = getLayout().formatCounts(COUNTS);

    setColor(false);
    setStyle('plain');
    setStyle('rich');
    setColor(true);

    expect(colourFirst).toContain(ESCAPE);
    expect(getLayout().formatCounts(COUNTS)).toBe(colourFirst);
  });

  it('never colours plain output', () => {
    setColor(true);
    setStyle('plain');

    expect(getLayout().formatCounts(COUNTS)).toBe('1 passed');
  });
});
