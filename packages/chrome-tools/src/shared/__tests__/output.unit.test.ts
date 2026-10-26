import { describe, expect, it } from 'vitest';

import { formatStatus, PLAIN_PALETTE, resolvePalette, resolveStreamOutputStyle } from '../output.ts';

describe(formatStatus, () => {
  it('pads every plain word to the width of the widest', () => {
    expect(formatStatus(PLAIN_PALETTE, 'plain', 'failed')).toBe('FAIL ');
    expect(formatStatus(PLAIN_PALETTE, 'plain', 'blocked')).toBe('BLOCK');
  });

  it('returns a rich glyph without padding, since every rich glyph is two cells wide', () => {
    expect(formatStatus(PLAIN_PALETTE, 'rich', 'warning')).toBe('🟠');
  });

  it('colours a pass, a failure, and a warning, and leaves the padding uncoloured', () => {
    const palette = resolvePalette({ TERM: 'xterm' }, true);
    expect(formatStatus(palette, 'plain', 'failed')).toBe(`${palette.red}FAIL${palette.normal} `);
    expect(formatStatus(palette, 'plain', 'passed')).toBe(`${palette.green}PASS${palette.normal} `);
    expect(formatStatus(palette, 'plain', 'warning')).toBe(`${palette.yellow}WARN${palette.normal} `);
  });

  it('leaves a blocked, skipped, or info glyph uncoloured', () => {
    const palette = resolvePalette({ TERM: 'xterm' }, true);
    expect(formatStatus(palette, 'plain', 'blocked')).toBe('BLOCK');
    expect(formatStatus(palette, 'plain', 'skipped')).toBe('SKIP ');
    expect(formatStatus(palette, 'plain', 'info')).toBe('INFO ');
  });
});

describe(resolveStreamOutputStyle, () => {
  it('reads the one stream that the caller names, and the override', () => {
    expect(resolveStreamOutputStyle({}, true).style).toBe('rich');
    expect(resolveStreamOutputStyle({}, false).style).toBe('plain');
    expect(resolveStreamOutputStyle({ THOR_CHROME_OUTPUT_STYLE: 'rich' }, false).style).toBe('rich');
  });
});

describe(resolvePalette, () => {
  it('enables color on a terminal when NO_COLOR is unset', () => {
    expect(resolvePalette({ TERM: 'xterm-256color' }, true).green).not.toBe('');
  });

  it('treats an empty NO_COLOR as unset', () => {
    expect(resolvePalette({ NO_COLOR: '', TERM: 'xterm-256color' }, true).green).not.toBe('');
  });

  it('disables color when NO_COLOR is set', () => {
    expect(resolvePalette({ NO_COLOR: '1', TERM: 'xterm-256color' }, true)).toStrictEqual(PLAIN_PALETTE);
  });

  it('disables color when the output is not a terminal', () => {
    expect(resolvePalette({ TERM: 'xterm-256color' }, false)).toStrictEqual(PLAIN_PALETTE);
  });

  it('disables color when the terminal type is unset or dumb', () => {
    expect(resolvePalette({}, true)).toStrictEqual(PLAIN_PALETTE);
    expect(resolvePalette({ TERM: 'dumb' }, true)).toStrictEqual(PLAIN_PALETTE);
  });
});
