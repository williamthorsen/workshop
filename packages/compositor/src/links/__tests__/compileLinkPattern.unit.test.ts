import { describe, expect, it } from 'vitest';

import { compileLinkPattern } from '../compileLinkPattern.ts';

describe(compileLinkPattern, () => {
  it('reports where the target capture sat, which is what lets the rewrite replace it alone', () => {
    const pattern = compileLinkPattern(String.raw`\[[^\]]*\]\(([^)]+)\)`);

    expect('see [x](./a.md)'.matchAll(pattern).toArray()[0]?.indices?.[1]).toStrictEqual([8, 14]);
  });

  it('finds every link on a line', () => {
    const pattern = compileLinkPattern(String.raw`\[[^\]]*\]\(([^)]+)\)`);

    const targets = '[a](./a.md) [b](./b.md)'
      .matchAll(pattern)
      .map((match) => match[1])
      .toArray();

    expect(targets).toStrictEqual(['./a.md', './b.md']);
  });

  it('takes its flags from the engine, so a declaration cannot ask for others', () => {
    expect(compileLinkPattern('(x)').flags).toBe('dg');
  });
});
