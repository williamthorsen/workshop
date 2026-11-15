import { describe, expect, it } from 'vitest';

import { bundleDeck } from '../bundleDeck.ts';

describe('presentation/deck.js', () => {
  it('leaves out zod and the version that readyup reads through Node', async () => {
    const bundle = await bundleDeck();

    expect(bundle).not.toMatch(/node_modules\/\.pnpm\/zod@/u);
    expect(bundle).not.toContain('resolveSelfVersion');
  });
});
