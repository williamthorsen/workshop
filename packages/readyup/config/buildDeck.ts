/** Writes `presentation/deck.js`, the deck's script, bundled from `presentation/src/`. */

import { writeFileSync } from 'node:fs';

import { bundleDeck, DECK_BUNDLE_PATH } from '../presentation/src/bundleDeck.ts';

writeFileSync(DECK_BUNDLE_PATH, await bundleDeck());
