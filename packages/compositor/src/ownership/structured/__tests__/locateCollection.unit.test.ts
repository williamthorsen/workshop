import { describe, expect, it } from 'vitest';

import { openDocument } from '../document-access.ts';
import { locateCollection } from '../locateCollection.ts';

/** Opens `content` for the tests below, which only ever supply hosts that parse. */
function open(content: string, format: 'json' | 'yaml' = 'yaml') {
  const opened = openDocument(content, format);
  if ('reason' in opened) {
    throw new Error(`Expected the fixture to parse, but: ${opened.reason}`);
  }
  return opened.document;
}

describe(locateCollection, () => {
  it('returns the items of the collection at the declared path', () => {
    const located = locateCollection(open('hooks:\n  - name: relay\n'), ['hooks']);

    expect(located).toHaveProperty('items');
    expect('items' in located && located.items).toHaveLength(1);
  });

  it('if the host carries nothing at the path, reports it absent', () => {
    expect(locateCollection(open('other: 1\n'), ['hooks'])).toStrictEqual({ absent: true });
  });

  it('if an ancestor along the path is missing, reports it absent', () => {
    expect(locateCollection(open('other: 1\n'), ['eventHooks', 'events'])).toStrictEqual({ absent: true });
  });

  it('if the path holds something other than a collection, blocks rather than reading it as empty', () => {
    const located = locateCollection(open('hooks: enabled\n'), ['hooks']);

    expect(located).toHaveProperty('blocked.reason', expect.stringContaining('other than a collection at "hooks"'));
  });

  it('keeps absent and wrong-shape apart, which is what stops a write from landing beside a foreign value', () => {
    expect(locateCollection(open('{}\n', 'json'), ['hooks'])).toStrictEqual({ absent: true });
    expect(locateCollection(open('{"hooks": {}}\n', 'json'), ['hooks'])).toHaveProperty('blocked');
  });

  it('if a value along the path is not a mapping, blocks rather than reading the leaf beyond it as absent', () => {
    expect(locateCollection(open('eventHooks: disabled\n'), ['eventHooks', 'events'])).toHaveProperty('blocked');
    expect(locateCollection(open('{"eventHooks": "disabled"}\n', 'json'), ['eventHooks', 'events'])).toHaveProperty(
      'blocked',
    );
  });

  it('if the path names no key, throws, the document root having no structure a removal could prune', () => {
    expect(() => locateCollection(open('- name: relay\n'), [])).toThrow(/at least one key/);
  });
});
