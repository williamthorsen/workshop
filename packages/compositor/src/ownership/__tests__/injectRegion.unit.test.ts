import { describe, expect, it } from 'vitest';

import { injectRegion } from '../injectRegion.ts';
import type { RegionMarkers } from '../RegionMarkers.ts';

const MARKERS: RegionMarkers = { open: '<!-- ambient:start -->', close: '<!-- ambient:end -->' };

describe(injectRegion, () => {
  it('replaces the content of a region the host already holds, leaving the text around it alone', () => {
    const content = `# Guidance\n\n${MARKERS.open}\nold\n${MARKERS.close}\n\nUser text.\n`;

    expect(injectRegion(content, MARKERS, 'new')).toStrictEqual({
      content: `# Guidance\n\n${MARKERS.open}\nnew\n${MARKERS.close}\n\nUser text.\n`,
    });
  });

  it('re-injecting an unchanged body is byte-identical, which is what keeps a re-run diff-free', () => {
    const content = `# Guidance\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n`;

    expect(injectRegion(content, MARKERS, 'body')).toStrictEqual({ content });
  });

  it('if the body holds a replacement sequence, writes it literally', () => {
    const outcome = injectRegion(`${MARKERS.open}\n${MARKERS.close}\n`, MARKERS, 'costs $& and $1');

    expect(outcome).toStrictEqual({ content: `${MARKERS.open}\ncosts $& and $1\n${MARKERS.close}\n` });
  });

  it('if the host holds no region, appends one separated by a blank line', () => {
    expect(injectRegion('# Guidance\n', MARKERS, 'body')).toStrictEqual({
      content: `# Guidance\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n`,
    });
  });

  it('if the host is blank, yields the region alone', () => {
    expect(injectRegion('', MARKERS, 'body')).toStrictEqual({
      content: `${MARKERS.open}\nbody\n${MARKERS.close}\n`,
    });
  });

  it('if the host is damaged, blocks with the reason rather than writing or throwing', () => {
    const content = `${MARKERS.open}\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n`;
    const outcome = injectRegion(content, MARKERS, 'new');

    expect(outcome).toHaveProperty('blocked.reason', expect.stringContaining('2 open markers'));
  });

  it('writes the markers as declared, so an indented YAML fence stays indented', () => {
    const markers: RegionMarkers = { open: '  # managed:start', close: '  # managed:end' };

    expect(injectRegion('prompts:\n', markers, '  - name: lint')).toStrictEqual({
      content: `prompts:\n\n${markers.open}\n  - name: lint\n${markers.close}\n`,
    });
  });
});
