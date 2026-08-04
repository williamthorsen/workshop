import { describe, expect, it } from 'vitest';

import type { DocumentAccess } from '../document-access.ts';
import { openDocument } from '../document-access.ts';
import type { LocatedCollection } from '../locateCollection.ts';
import { locateCollection } from '../locateCollection.ts';
import type { OwnedItemsSpec } from '../OwnedItemsSpec.ts';

const COLLECTION = ['eventHooks', 'events'];

/** One host shape, written once per format, with the single state the contract requires both to reach. */
interface HostShape {
  readonly name: string;
  readonly expected: string;
  readonly json: string;
  readonly yaml: string;
}

// `DocumentAccess` is one contract with two implementations, and every divergence between them has been a shape both
// formats accept and classify differently. Driving one table through both is what turns the next one into a failing
// row rather than something a reader has to think to ask.
const SHAPES: ReadonlyArray<HostShape> = [
  { name: 'an empty document', expected: 'absent', json: '', yaml: '' },
  { name: 'a document carrying other keys', expected: 'absent', json: '{"other": 1}', yaml: 'other: 1\n' },
  {
    name: 'a missing leaf below a present ancestor',
    expected: 'absent',
    json: '{"eventHooks": {}}',
    yaml: 'eventHooks: {}\n',
  },
  {
    name: 'a leaf stubbed out with no value',
    expected: 'absent',
    json: '{"eventHooks": {"events": null}}',
    yaml: 'eventHooks:\n  events:\n',
  },
  {
    name: 'an ancestor stubbed out with no value',
    expected: 'absent',
    json: '{"eventHooks": null}',
    yaml: 'eventHooks:\n',
  },
  {
    name: 'a scalar where the collection belongs',
    expected: 'blocked',
    json: '{"eventHooks": {"events": "enabled"}}',
    yaml: 'eventHooks:\n  events: enabled\n',
  },
  {
    name: 'a scalar at an ancestor',
    expected: 'blocked',
    json: '{"eventHooks": "disabled"}',
    yaml: 'eventHooks: disabled\n',
  },
  {
    name: 'a mapping where the collection belongs',
    expected: 'blocked',
    json: '{"eventHooks": {"events": {}}}',
    yaml: 'eventHooks:\n  events: {}\n',
  },
  {
    name: 'an empty collection',
    expected: 'collection:0',
    json: '{"eventHooks": {"events": []}}',
    yaml: 'eventHooks:\n  events: []\n',
  },
  {
    name: 'a collection holding items',
    expected: 'collection:2',
    json: '{"eventHooks": {"events": [{"a": 1}, {"b": 2}]}}',
    yaml: 'eventHooks:\n  events:\n    - a: 1\n    - b: 2\n',
  },
];

describe.each(['json', 'yaml'] as const)('DocumentAccess over a %s host', (format: OwnedItemsSpec['format']) => {
  it.each(SHAPES)('reads $name as $expected', (shape: HostShape) => {
    expect(summarize(locateCollection(open(shape[format], format), COLLECTION))).toBe(shape.expected);
  });
});

// region | Helpers

/** Opens a fixture for the table above, which supplies only hosts that parse. */
function open(content: string, format: OwnedItemsSpec['format']): DocumentAccess {
  const opened = openDocument(content, format);
  if ('reason' in opened) {
    throw new Error(`Expected the fixture to parse, but: ${opened.reason}`);
  }
  return opened.document;
}

/** Reduces a lookup to the fact the contract pins: which of the three states it reached, and how many items it found. */
function summarize(located: LocatedCollection): string {
  if ('blocked' in located) {
    return 'blocked';
  }
  if ('absent' in located) {
    return 'absent';
  }
  return `collection:${located.items.length}`;
}

// endregion | Helpers
