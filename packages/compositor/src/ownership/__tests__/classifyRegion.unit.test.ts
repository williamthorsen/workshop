import { describe, expect, it } from 'vitest';

import { classifyRegion } from '../classifyRegion.ts';
import type { RegionMarkers } from '../RegionMarkers.ts';

const MARKERS: RegionMarkers = { open: '<!-- ambient:start -->', close: '<!-- ambient:end -->' };
const YAML_MARKERS: RegionMarkers = { open: '  # managed:start', close: '  # managed:end' };

describe(classifyRegion, () => {
  it('if the host holds no markers, reports it absent', () => {
    expect(classifyRegion('# Guidance\n', MARKERS)).toStrictEqual({ state: 'absent' });
  });

  it('if the host holds one well-formed region, reports it complete', () => {
    const content = `# Guidance\n\n${MARKERS.open}\nUse sentence case.\n${MARKERS.close}\n`;

    expect(classifyRegion(content, MARKERS)).toStrictEqual({ state: 'complete' });
  });

  it('if the region is empty, reports it complete', () => {
    expect(classifyRegion(`${MARKERS.open}\n${MARKERS.close}\n`, MARKERS)).toStrictEqual({ state: 'complete' });
  });

  it('if a stray open marker sits above a well-formed region, reports it malformed and counts the markers', () => {
    const content = `${MARKERS.open}\n\n${MARKERS.open}\nbody\n${MARKERS.close}\n`;
    const classification = classifyRegion(content, MARKERS);

    expect(classification.state).toBe('malformed');
    expect(classification).toHaveProperty('reason', expect.stringContaining('2 open markers and 1 close marker'));
  });

  it('if an open marker has no close, reports it malformed', () => {
    const classification = classifyRegion(`${MARKERS.open}\nbody\n`, MARKERS);

    expect(classification).toHaveProperty('reason', expect.stringContaining('1 open marker and no close marker'));
  });

  it('if a close marker has no open, reports it malformed', () => {
    const classification = classifyRegion(`body\n${MARKERS.close}\n`, MARKERS);

    expect(classification).toHaveProperty('reason', expect.stringContaining('no open marker and 1 close marker'));
  });

  it('if the close marker precedes its open, reports it malformed rather than complete', () => {
    const content = `${MARKERS.close}\nbody\n${MARKERS.open}\n`;

    expect(classifyRegion(content, MARKERS)).toStrictEqual({
      state: 'malformed',
      reason: 'The host has a close marker before its open marker.',
    });
  });

  it('if the markers are indented, as a YAML host indents them, reports the region complete', () => {
    const content = `prompts:\n${YAML_MARKERS.open}\n  - name: lint\n${YAML_MARKERS.close}\n`;

    expect(classifyRegion(content, YAML_MARKERS)).toStrictEqual({ state: 'complete' });
  });

  it('if a formatter re-indented the markers, still finds the region rather than reporting it absent', () => {
    const content = `prompts:\n    # managed:start\n  - name: lint\n    # managed:end\n`;

    expect(classifyRegion(content, YAML_MARKERS)).toStrictEqual({ state: 'complete' });
  });

  it('if a marker is quoted mid-line rather than holding the line, does not read it as a marker', () => {
    const content = `Fence the block with ${MARKERS.open} and close it.\n`;

    expect(classifyRegion(content, MARKERS)).toStrictEqual({ state: 'absent' });
  });

  it('if the markers are equal, throws rather than blocking, the fault being the declaration and not the host', () => {
    expect(() => classifyRegion('', { open: '# x', close: '# x' })).toThrow(/must differ/);
  });

  it('if a marker is blank, throws', () => {
    expect(() => classifyRegion('', { open: ' '.repeat(3), close: '# x' })).toThrow(/must not be blank/);
  });

  it('if a marker holds a line break, throws, since every pattern here anchors to a line', () => {
    expect(() => classifyRegion('', { open: '# a\n# b', close: '# x' })).toThrow(/single line/);
  });
});
