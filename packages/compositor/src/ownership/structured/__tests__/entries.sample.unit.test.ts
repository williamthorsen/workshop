import { describe, expect, it } from 'vitest';

import { SETTINGS_JSON_CURRENT, SETTINGS_JSON_PLANNED } from '../../../samples/representative/file-bodies.ts';
import type { OwnedItemsSpec } from '../../../schemas/owned-items-schemas.ts';
import { ensureOwnedItems } from '../ensureOwnedItems.ts';
import { readOwnedItems } from '../readOwnedItems.ts';

// The sample declares this destination `{ kind: 'entries', sentinel: 'codeassembly', format: 'json' }`, so its two
// sides are what this mechanism is supposed to produce and read. The region family has the same pairing in
// `region.sample.unit.test.ts`.
const SPEC: OwnedItemsSpec = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
};

const HOOKS = [{ command: 'relay --on=stop' }, { command: 'relay --on=review' }];

describe('entry ownership over the representative sample', () => {
  it('drives the current settings file to the planned one, byte for byte', () => {
    expect(ensureOwnedItems(SETTINGS_JSON_CURRENT, SPEC, HOOKS)).toStrictEqual({ content: SETTINGS_JSON_PLANNED });
  });

  it('re-applying the planned file writes nothing', () => {
    expect(ensureOwnedItems(SETTINGS_JSON_PLANNED, SPEC, HOOKS)).toStrictEqual({ content: SETTINGS_JSON_PLANNED });
  });

  it('reads back the owned hooks alone, leaving the one another tool wrote', () => {
    expect(readOwnedItems(SETTINGS_JSON_PLANNED, SPEC)).toStrictEqual({
      items: HOOKS.map((hook) => ({ ...hook, source: 'codeassembly' })),
    });
  });
});
