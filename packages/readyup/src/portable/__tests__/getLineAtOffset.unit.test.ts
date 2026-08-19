import { describe, expect, it } from 'vitest';

import { blankNonCode } from '../blankNonCode.ts';
import { getLineAtOffset } from '../getLineAtOffset.ts';

const SOURCE = 'first\nsecond\nthird';

describe(getLineAtOffset, () => {
  it('numbers the first line 1', () => {
    expect(getLineAtOffset(SOURCE, 0)).toBe(1);
  });

  it('numbers the line holding an offset', () => {
    expect(getLineAtOffset(SOURCE, SOURCE.indexOf('third'))).toBe(3);
  });

  it('attributes a newline to the line it ends', () => {
    expect(getLineAtOffset(SOURCE, SOURCE.indexOf('\n'))).toBe(1);
  });

  it('attributes the offset just past a newline to the line it begins', () => {
    expect(getLineAtOffset(SOURCE, SOURCE.indexOf('\n') + 1)).toBe(2);
  });

  it('resolves an offset taken from a blanked text against the source it came from', () => {
    const source = `const a = 1;\n/* filler\n   filler */\nconst bounded = Math.max(0, n);\n`;
    const blanked = blankNonCode(source);

    const lineInBlanked = getLineAtOffset(blanked, blanked.indexOf('Math.max'));

    expect(lineInBlanked).toBe(getLineAtOffset(source, source.indexOf('Math.max')));
    expect(lineInBlanked).toBe(4);
  });
});
