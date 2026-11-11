import { describe, expect, it } from 'vitest';

import { findMarkerFaults } from '../findMarkerFaults.ts';

describe(findMarkerFaults, () => {
  it('accepts markers that can delimit a span', () => {
    expect(
      findMarkerFaults({ open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' }, 'markers'),
    ).toStrictEqual([]);
  });

  it('reports markers spanning a line break, which no line-anchored match could find, at their path', () => {
    expect(findMarkerFaults({ open: '<!--\ncodeassembly -->', close: '<!-- /x -->' }, 'markers')).toStrictEqual([
      { path: 'markers', message: 'A region marker must occupy a single line.' },
    ]);
  });
});
