import { describe, expect, it } from 'vitest';

import { formatContinuationLine, formatLabelledLine, LINE_LABELS } from '../labelled-lines.ts';

const TEXT = "status 'Legacy' is not in the spec and will not be touched";

describe(formatLabelledLine, () => {
  it('starts the text of every label in the same column', () => {
    const columns = new Set(LINE_LABELS.map((label) => formatLabelledLine(label, TEXT).indexOf(TEXT)));

    expect(columns.size).toBe(1);
  });

  it('separates every label, the longest included, from its unchanged text by at least one space', () => {
    for (const label of LINE_LABELS) {
      const line = formatLabelledLine(label, TEXT);

      expect(line.startsWith(label)).toBe(true);
      expect(line.endsWith(TEXT)).toBe(true);
      expect(line.slice(label.length, -TEXT.length)).toMatch(/^ +$/);
    }
  });
});

describe(formatContinuationLine, () => {
  it('starts its unchanged text in the column of a labelled line', () => {
    const line = formatContinuationLine(TEXT);

    expect(line.indexOf(TEXT)).toBe(formatLabelledLine('unmanaged', TEXT).indexOf(TEXT));
    expect(line.trimStart()).toBe(TEXT);
  });
});
