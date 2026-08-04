import { describe, expect, it } from 'vitest';

import type { OwnedItemsSpec } from '../OwnedItemsSpec.ts';
import { readOwnedItems } from '../readOwnedItems.ts';

const YAML_SPEC: OwnedItemsSpec = {
  format: 'yaml',
  collection: ['eventHooks', 'events'],
  sentinel: { path: ['source'], value: 'compositor' },
};

const JSON_SPEC: OwnedItemsSpec = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'compositor' },
};

describe(readOwnedItems, () => {
  it('reads the owned items in the order the host holds them, skipping foreign ones', () => {
    const content = [
      'eventHooks:',
      '  events:',
      '    - name: vendor-sync',
      '    - name: relay',
      '      source: compositor',
      '    - name: audit',
      '      source: compositor',
      '',
    ].join('\n');

    expect(readOwnedItems(content, YAML_SPEC)).toStrictEqual({
      items: [
        { name: 'relay', source: 'compositor' },
        { name: 'audit', source: 'compositor' },
      ],
    });
  });

  it('if the collection is absent, reads no items rather than blocking', () => {
    expect(readOwnedItems('other: 1\n', YAML_SPEC)).toStrictEqual({ items: [] });
  });

  it('if the collection holds only foreign items, reads none', () => {
    expect(readOwnedItems('eventHooks:\n  events:\n    - name: vendor-sync\n', YAML_SPEC)).toStrictEqual({ items: [] });
  });

  it('if the declared path holds something other than a collection, blocks', () => {
    expect(readOwnedItems('eventHooks:\n  events: enabled\n', YAML_SPEC)).toHaveProperty('blocked.reason');
  });

  it('reads a JSON host through the same signature', () => {
    const content =
      '{\n  "hooks": [\n    { "command": "vendor" },\n    { "command": "relay", "source": "compositor" }\n  ]\n}\n';

    expect(readOwnedItems(content, JSON_SPEC)).toStrictEqual({
      items: [{ command: 'relay', source: 'compositor' }],
    });
  });
});
