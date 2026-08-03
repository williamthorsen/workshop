import { describe, expect, it } from 'vitest';

import type { RegionMarkers } from '../RegionMarkers.ts';
import { renderContribution } from '../renderContribution.ts';

const MARKERS: RegionMarkers = { open: '<!-- rulebook:style -->', close: '<!-- /rulebook:style -->' };

describe(renderContribution, () => {
  it('wraps the body in its markers with no surrounding newlines', () => {
    expect(renderContribution(MARKERS, 'Use sentence case.')).toBe(
      `${MARKERS.open}\nUse sentence case.\n${MARKERS.close}`,
    );
  });

  it('if the body is empty, yields adjacent marker lines', () => {
    expect(renderContribution(MARKERS, '')).toBe(`${MARKERS.open}\n${MARKERS.close}`);
  });

  it('trims trailing newlines so a body rendered twice renders identically', () => {
    expect(renderContribution(MARKERS, 'Use sentence case.\n\n')).toBe(
      renderContribution(MARKERS, 'Use sentence case.'),
    );
  });

  it("preserves a body's leading indentation, which a YAML host's items depend on", () => {
    const markers: RegionMarkers = { open: '  # managed:start', close: '  # managed:end' };

    expect(renderContribution(markers, '  - name: lint')).toBe(`${markers.open}\n  - name: lint\n${markers.close}`);
  });

  it('if the markers are equal, throws', () => {
    expect(() => renderContribution({ open: '# x', close: '# x' }, 'body')).toThrow(/must differ/);
  });
});
