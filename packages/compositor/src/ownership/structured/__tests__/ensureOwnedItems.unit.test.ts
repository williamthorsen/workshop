import { describe, expect, it } from 'vitest';

import { ensureOwnedItems } from '../ensureOwnedItems.ts';
import type { OwnedItemsSpec } from '../OwnedItemsSpec.ts';

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

/** Reads the content an outcome carries, failing the test when it blocked instead. */
function contentOf(outcome: { content: string } | { blocked: { reason: string } }): string {
  if ('blocked' in outcome) {
    throw new Error(`Expected content, but the host blocked: ${outcome.blocked.reason}`);
  }
  return outcome.content;
}

describe(ensureOwnedItems, () => {
  it('if the owned items already read as asked, returns the host untouched, so a re-run is byte-identical', () => {
    const content = 'eventHooks:\n  events:\n    - name: relay\n      source: compositor\n';

    expect(ensureOwnedItems(content, YAML_SPEC, [{ name: 'relay' }])).toStrictEqual({ content });
  });

  it('leaves foreign items, foreign keys, and foreign comments in place', () => {
    const content = [
      'eventHooks:',
      '  logFile: hooks.log',
      '  events:',
      '    # written by hand, do not remove',
      '    - name: vendor-sync',
      '    - name: relay',
      '      source: compositor',
      '',
    ].join('\n');

    const merged = contentOf(ensureOwnedItems(content, YAML_SPEC, [{ name: 'relay-v2' }]));

    expect(merged).toContain('# written by hand, do not remove');
    expect(merged).toContain('name: vendor-sync');
    expect(merged).toContain('logFile: hooks.log');
    expect(merged).toContain('name: relay-v2');
    expect(merged).not.toContain('name: relay\n');
  });

  it('replaces a drifted owned item where it stood rather than appending beside it', () => {
    const content = [
      'eventHooks:',
      '  events:',
      '    - name: relay',
      '      source: compositor',
      '    - name: vendor-sync',
      '',
    ].join('\n');

    const merged = contentOf(ensureOwnedItems(content, YAML_SPEC, [{ name: 'relay-v2' }]));

    expect(merged.indexOf('relay-v2')).toBeLessThan(merged.indexOf('vendor-sync'));
  });

  it('collapses duplicate owned items into the set it was given', () => {
    const content = [
      'eventHooks:',
      '  events:',
      '    - name: relay',
      '      source: compositor',
      '    - name: relay',
      '      source: compositor',
      '',
    ].join('\n');

    const merged = contentOf(ensureOwnedItems(content, YAML_SPEC, [{ name: 'relay' }]));

    expect(merged.match(/name: relay/g)).toHaveLength(1);
  });

  it('stamps the sentinel onto an item written without one, so it reads back as owned', () => {
    const merged = contentOf(ensureOwnedItems('eventHooks:\n  events: []\n', YAML_SPEC, [{ name: 'relay' }]));

    expect(merged).toContain('source: compositor');
  });

  it('creates the collection and the structure above it when the host carries neither', () => {
    const merged = contentOf(ensureOwnedItems('other: 1\n', YAML_SPEC, [{ name: 'relay' }]));

    expect(merged).toContain('other: 1');
    expect(merged).toContain('eventHooks:');
    expect(merged).toContain('name: relay');
  });

  it('if there is nothing to install and no collection to install it in, writes no structure', () => {
    expect(ensureOwnedItems('other: 1\n', YAML_SPEC, [])).toStrictEqual({ content: 'other: 1\n' });
  });

  it('if the declared path holds something other than a collection, blocks rather than writing', () => {
    const outcome = ensureOwnedItems('eventHooks:\n  events: enabled\n', YAML_SPEC, [{ name: 'relay' }]);

    expect(outcome).toHaveProperty('blocked.reason', expect.stringContaining('other than a collection'));
  });

  it('if the host does not parse, blocks rather than throwing', () => {
    const outcome = ensureOwnedItems('eventHooks:\n\t- broken\n', YAML_SPEC, [{ name: 'relay' }]);

    expect(outcome).toHaveProperty('blocked.reason', expect.stringContaining('not valid YAML'));
  });

  it('if a value along the path is not a mapping, blocks rather than letting the write throw', () => {
    const outcome = ensureOwnedItems('eventHooks: disabled\n', YAML_SPEC, [{ name: 'relay' }]);

    expect(outcome).toHaveProperty('blocked.reason', expect.stringContaining('other than a collection'));
  });

  describe('over a JSON host', () => {
    it('installs through the same signature, keeping foreign items', () => {
      const content = '{\n  "hooks": [\n    { "command": "vendor-tool sync" }\n  ]\n}\n';
      const merged = contentOf(ensureOwnedItems(content, JSON_SPEC, [{ command: 'relay --on=stop' }]));

      expect(JSON.parse(merged)).toStrictEqual({
        hooks: [{ command: 'vendor-tool sync' }, { command: 'relay --on=stop', source: 'compositor' }],
      });
    });

    it("writes the host back in the host's own indentation", () => {
      const content = '{\n    "hooks": [\n        { "command": "vendor-tool sync" }\n    ]\n}\n';
      const merged = contentOf(ensureOwnedItems(content, JSON_SPEC, [{ command: 'relay' }]));

      expect(merged).toContain('\n    "hooks"');
      expect(merged.endsWith('\n')).toBe(true);
    });

    it('if the owned items already read as asked, returns the host untouched', () => {
      const content =
        '{\n  "hooks": [\n    {\n      "command": "relay",\n      "source": "compositor"\n    }\n  ]\n}\n';

      expect(ensureOwnedItems(content, JSON_SPEC, [{ command: 'relay' }])).toStrictEqual({ content });
    });

    it('if the host does not parse, blocks rather than throwing', () => {
      expect(ensureOwnedItems('{ "hooks": ', JSON_SPEC, [])).toHaveProperty(
        'blocked.reason',
        expect.stringContaining('not valid JSON'),
      );
    });

    it('if a value along the path is not a mapping, blocks rather than reporting a write it never made', () => {
      const outcome = ensureOwnedItems(
        '{"eventHooks": "disabled"}\n',
        { ...JSON_SPEC, collection: ['eventHooks', 'events'] },
        [{ command: 'relay' }],
      );

      expect(outcome).toHaveProperty('blocked.reason', expect.stringContaining('other than a collection'));
    });

    it('expands an item the host held inline, the indent unit and trailing newline being what carry over', () => {
      const content = '{\n  "hooks": [\n    { "command": "vendor-tool sync" }\n  ]\n}\n';

      expect(contentOf(ensureOwnedItems(content, JSON_SPEC, [{ command: 'relay' }]))).toBe(
        '{\n  "hooks": [\n    {\n      "command": "vendor-tool sync"\n    },\n' +
          '    {\n      "command": "relay",\n      "source": "compositor"\n    }\n  ]\n}\n',
      );
    });
  });
});
