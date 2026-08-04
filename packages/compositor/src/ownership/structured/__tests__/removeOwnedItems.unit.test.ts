import { describe, expect, it } from 'vitest';

import type { OwnedItemsSpec } from '../OwnedItemsSpec.ts';
import { removeOwnedItems } from '../removeOwnedItems.ts';

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

describe(removeOwnedItems, () => {
  it('leaves a collection holding its foreign items alone', () => {
    const content = [
      'eventHooks:',
      '  events:',
      '    - name: vendor-sync',
      '    - name: relay',
      '      source: compositor',
      '',
    ].join('\n');

    const stripped = contentOf(removeOwnedItems(content, YAML_SPEC));

    expect(stripped).toContain('name: vendor-sync');
    expect(stripped).not.toContain('source: compositor');
  });

  it('prunes the structure the deletion emptied, all the way up', () => {
    const content = 'eventHooks:\n  events:\n    - name: relay\n      source: compositor\n';

    expect(contentOf(removeOwnedItems(content, YAML_SPEC))).not.toContain('eventHooks');
  });

  it('keeps an ancestor that still carries other keys', () => {
    const content = 'eventHooks:\n  logFile: hooks.log\n  events:\n    - name: relay\n      source: compositor\n';
    const stripped = contentOf(removeOwnedItems(content, YAML_SPEC));

    expect(stripped).toContain('logFile: hooks.log');
    expect(stripped).not.toContain('events:');
  });

  it('if the host carries no owned items, returns it untouched', () => {
    const content = 'eventHooks:\n  events:\n    - name: vendor-sync\n';

    expect(removeOwnedItems(content, YAML_SPEC)).toStrictEqual({ content });
  });

  it('if the collection is absent, returns the host untouched', () => {
    expect(removeOwnedItems('other: 1\n', YAML_SPEC)).toStrictEqual({ content: 'other: 1\n' });
  });

  it('if the declared path holds something other than a collection, blocks', () => {
    expect(removeOwnedItems('eventHooks:\n  events: enabled\n', YAML_SPEC)).toHaveProperty('blocked.reason');
  });

  it('strips a JSON host through the same signature, pruning the emptied key', () => {
    const content = '{\n  "hooks": [\n    { "command": "relay", "source": "compositor" }\n  ]\n}\n';

    expect(JSON.parse(contentOf(removeOwnedItems(content, JSON_SPEC)))).toStrictEqual({});
  });
});

// region | Helpers

/** Reads the content an outcome carries, failing the test when it blocked instead. */
function contentOf(outcome: { content: string } | { blocked: { reason: string } }): string {
  if ('blocked' in outcome) {
    throw new Error(`Expected content, but the host blocked: ${outcome.blocked.reason}`);
  }
  return outcome.content;
}

// endregion | Helpers
