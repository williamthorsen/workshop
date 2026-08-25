import { describe, expect, it } from 'vitest';

import type { OwnedItemsSpec } from '../OwnedItemsSpec.ts';
import { allowsStamping, applySentinel, carriesSentinel, stampSentinel } from '../sentinel.ts';

type Sentinel = OwnedItemsSpec['sentinel'];

const SENTINEL: Sentinel = { path: ['source'], value: 'compositor' };
const NESTED: Sentinel = { path: ['meta', 'writtenBy'], value: 'compositor' };
// The shapes the two harnesses CodeAssembly writes today bury their mark in: a flag inside a command string, reached
// through an array the declaration cannot name a position in.
const CLAUDE_HOOK: Sentinel = {
  path: ['hooks', '*', 'command'],
  value: '--sentinel codeassembly-agents',
  match: 'contains',
};
const ROVO_HOOK: Sentinel = { path: ['commands', '*'], value: '--sentinel codeassembly-agents', match: 'contains' };

const CLAUDE_GROUP = {
  hooks: [{ type: 'command', command: 'node relay.mjs --hook Stop --sentinel codeassembly-agents' }],
};
const ROVO_ENTRY = { name: 'on_session_start', commands: ['node relay.mjs --sentinel codeassembly-agents'] };

describe(carriesSentinel, () => {
  it('if the item carries the value at the sentinel path, claims it', () => {
    expect(carriesSentinel({ name: 'relay', source: 'compositor' }, SENTINEL)).toBe(true);
  });

  it('if the item carries another value there, does not claim it', () => {
    expect(carriesSentinel({ name: 'relay', source: 'vendor-tool' }, SENTINEL)).toBe(false);
  });

  it('if the item carries nothing there, does not claim it', () => {
    expect(carriesSentinel({ name: 'relay' }, SENTINEL)).toBe(false);
  });

  it('reads a sentinel nested below the item root', () => {
    expect(carriesSentinel({ meta: { writtenBy: 'compositor' } }, NESTED)).toBe(true);
  });

  it('if the item is a scalar, does not claim it', () => {
    expect(carriesSentinel('relay', SENTINEL)).toBe(false);
  });

  it('claims an item whose mark sits inside a command string below an array', () => {
    expect(carriesSentinel(CLAUDE_GROUP, CLAUDE_HOOK)).toBe(true);
  });

  it('claims an item whose mark sits inside an array of strings', () => {
    expect(carriesSentinel(ROVO_ENTRY, ROVO_HOOK)).toBe(true);
  });

  it('claims an item when any one of the array elements carries the mark', () => {
    const group = { hooks: [{ command: 'vendor-tool sync' }, { command: 'relay --sentinel codeassembly-agents' }] };

    expect(carriesSentinel(group, CLAUDE_HOOK)).toBe(true);
  });

  it('does not claim an item whose array carries the mark nowhere', () => {
    expect(carriesSentinel({ hooks: [{ command: 'vendor-tool sync' }] }, CLAUDE_HOOK)).toBe(false);
  });

  it('if a wildcard reaches something that is not an array, does not claim it', () => {
    expect(carriesSentinel({ hooks: { command: 'relay --sentinel codeassembly-agents' } }, CLAUDE_HOOK)).toBe(false);
  });

  it('under a containment match, does not claim a value that merely equals part of the mark', () => {
    expect(carriesSentinel({ commands: ['--sentinel'] }, ROVO_HOOK)).toBe(false);
  });

  it('under an equality match, does not claim a value that only contains the mark', () => {
    expect(carriesSentinel({ name: 'relay', source: 'compositor-v2' }, SENTINEL)).toBe(false);
  });
});

describe(allowsStamping, () => {
  it('allows a sentinel naming one key path and an exact value', () => {
    expect(allowsStamping(SENTINEL)).toBe(true);
  });

  it('allows a sentinel that states its equality match explicitly', () => {
    expect(allowsStamping({ ...SENTINEL, match: 'equals' })).toBe(true);
  });

  it('refuses a sentinel whose path branches over an array', () => {
    expect(allowsStamping({ path: ['commands', '*'], value: 'compositor' })).toBe(false);
  });

  it('refuses a sentinel matching by containment, which states no value to write', () => {
    expect(allowsStamping({ path: ['command'], value: 'compositor', match: 'contains' })).toBe(false);
  });
});

describe(applySentinel, () => {
  it('stamps an item where the sentinel names a place to write', () => {
    expect(applySentinel({ name: 'relay' }, SENTINEL)).toStrictEqual({ name: 'relay', source: 'compositor' });
  });

  it('passes through an item that already carries a sentinel the engine cannot write', () => {
    expect(applySentinel(CLAUDE_GROUP, CLAUDE_HOOK)).toStrictEqual(CLAUDE_GROUP);
  });

  it('if the sentinel cannot be written and the item does not carry it, throws naming the path', () => {
    expect(() => applySentinel({ hooks: [{ command: 'vendor-tool sync' }] }, CLAUDE_HOOK)).toThrow(
      /hooks\.\*\.command.*does not already carry it/s,
    );
  });
});

describe(stampSentinel, () => {
  it('marks an item so that it reads back as owned', () => {
    const stamped = stampSentinel({ name: 'relay' }, SENTINEL);

    expect(stamped).toStrictEqual({ name: 'relay', source: 'compositor' });
    expect(carriesSentinel(stamped, SENTINEL)).toBe(true);
  });

  it('creates the mappings a nested sentinel path descends through', () => {
    expect(stampSentinel({ name: 'relay' }, NESTED)).toStrictEqual({
      name: 'relay',
      meta: { writtenBy: 'compositor' },
    });
  });

  it('overwrites a conflicting value rather than leaving an item it could not find again', () => {
    expect(stampSentinel({ source: 'vendor-tool' }, SENTINEL)).toStrictEqual({ source: 'compositor' });
  });

  it('leaves the item it was given alone', () => {
    const item = { name: 'relay' };
    stampSentinel(item, SENTINEL);

    expect(item).toStrictEqual({ name: 'relay' });
  });

  it('if the item cannot hold the sentinel, throws rather than writing an unfindable item', () => {
    expect(() => stampSentinel('relay', SENTINEL)).toThrow(/not a mapping/);
  });

  it('if the sentinel names no key, throws', () => {
    expect(() => stampSentinel({ name: 'relay' }, { path: [], value: 'compositor' })).toThrow(/at least one key/);
  });

  it('if the sentinel names no single place to write, throws', () => {
    expect(() => stampSentinel(CLAUDE_GROUP, CLAUDE_HOOK)).toThrow(/no single place to write/);
  });
});
