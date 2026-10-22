import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BUILD_DECK_COMMAND, bundleDeck, DECK_BUNDLE_PATH } from '../bundleDeck.ts';

describe('presentation/deck.js', () => {
  it('matches a fresh bundle of its source', async () => {
    const isFresh = readFileSync(DECK_BUNDLE_PATH, 'utf8') === (await bundleDeck());

    expect(isFresh, `presentation/deck.js is stale; rebuild it with \`${BUILD_DECK_COMMAND}\``).toBe(true);
  });

  it('leaves out zod and the version that readyup reads through Node', async () => {
    const bundle = await bundleDeck();

    expect(bundle).not.toMatch(/node_modules\/\.pnpm\/zod@/u);
    expect(bundle).not.toContain('resolveSelfVersion');
  });
});
