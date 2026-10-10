import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import {
  appendEntry,
  parseRegistry,
  readRegistry,
  type Registry,
  saveRegistry,
  selectEntries,
  serializeRegistry,
  writeStack,
} from '../registry.ts';

const FIXTURE = `# A registry header.
#
# tags:
#   live -- deploys from a live worktree.
repos:
  - name: alpha
    path: ~/repos/alpha
    repo: owner/alpha
    tags: [live, vault]
  # A comment above an entry.
  - name: beta
    path: ~/repos/beta
    repo: owner/beta
    stack: [nextjs, react]
  - name: gamma # trailing comment
    path: ~/repos/gamma
    repo: owner/gamma
    tags: [live]
    stack: [supabase]
`;

describe(parseRegistry, () => {
  it('reads each entry with its tags and stack', () => {
    const registry = parse(FIXTURE);
    expect(
      registry.entries.map(({ name, path, repo, stack, tags }) => ({ name, path, repo, stack, tags })),
    ).toStrictEqual([
      { name: 'alpha', path: '~/repos/alpha', repo: 'owner/alpha', stack: [], tags: ['live', 'vault'] },
      { name: 'beta', path: '~/repos/beta', repo: 'owner/beta', stack: ['nextjs', 'react'], tags: [] },
      { name: 'gamma', path: '~/repos/gamma', repo: 'owner/gamma', stack: ['supabase'], tags: ['live'] },
    ]);
  });

  it('reads an entry without a path, leaving the refusal to the caller that selects it', () => {
    expect(parse('repos:\n  - name: pathless\n').entries[0]?.path).toBeUndefined();
  });

  it('reads a registry without entries', () => {
    expect(parse('repos:\n').entries).toStrictEqual([]);
  });

  it.each([
    [
      'a tags value that is not a list',
      'repos:\n  - path: ~/a\n    tags: live\n',
      "entry 1: 'tags' is not a list of strings",
    ],
    [
      'a stack list holding a number',
      'repos:\n  - path: ~/a\n    stack: [1]\n',
      "entry 1: 'stack' is not a list of strings",
    ],
    ['a path that is not a string', 'repos:\n  - path: [a]\n', "entry 1: 'path' is not a string"],
    ['an entry that is not a mapping', 'repos:\n  - ~/a\n', 'entry 1 is not a mapping'],
    ['a repos key that is not a list', 'repos: {}\n', "'repos' is not a list"],
  ])('refuses %s', (_, text, message) => {
    expect(parseRegistry(text)).toBe(message);
  });
});

describe(readRegistry, () => {
  it('names a registry that it cannot find', () => {
    expect(readRegistry('/nonexistent/repos.yaml')).toBe('registry not found: /nonexistent/repos.yaml');
  });
});

describe(selectEntries, () => {
  it('matches a tag and a stack name exactly, and ANDs them', () => {
    const { entries } = parse(FIXTURE);
    expect(names(selectEntries(entries, {}))).toStrictEqual(['alpha', 'beta', 'gamma']);
    expect(names(selectEntries(entries, { tag: 'live' }))).toStrictEqual(['alpha', 'gamma']);
    expect(names(selectEntries(entries, { tag: 'liv' }))).toStrictEqual([]);
    expect(names(selectEntries(entries, { stack: 'react' }))).toStrictEqual(['beta']);
    expect(names(selectEntries(entries, { stack: 'supabase', tag: 'live' }))).toStrictEqual(['gamma']);
    expect(names(selectEntries(entries, { stack: 'react', tag: 'live' }))).toStrictEqual([]);
  });
});

describe(writeStack, () => {
  it('reproduces an unchanged registry byte for byte', () => {
    expect(serializeRegistry(parse(FIXTURE))).toBe(FIXTURE);
  });

  it('adds a stack as the only change, keeping comments, key order, tags, and flow style', () => {
    const registry = parse(FIXTURE);
    writeStack(registry, entry(registry, 'alpha'), ['nmr', 'react']);
    expect(serializeRegistry(registry)).toBe(
      FIXTURE.replace('    tags: [live, vault]\n', '    tags: [live, vault]\n    stack: [nmr, react]\n'),
    );
  });

  it('replaces a stack in place', () => {
    const registry = parse(FIXTURE);
    writeStack(registry, entry(registry, 'beta'), ['nextjs']);
    expect(serializeRegistry(registry)).toBe(FIXTURE.replace('stack: [nextjs, react]', 'stack: [nextjs]'));
  });

  it('restores the input byte for byte when an added stack is deleted', () => {
    const registry = parse(FIXTURE);
    writeStack(registry, entry(registry, 'alpha'), ['nmr']);
    writeStack(registry, entry(registry, 'alpha'), []);
    expect(serializeRegistry(registry)).toBe(FIXTURE);
  });

  it('removes the key when the detected set is empty', () => {
    const registry = parse(FIXTURE);
    writeStack(registry, entry(registry, 'gamma'), []);
    expect(serializeRegistry(registry)).toBe(FIXTURE.replace('    stack: [supabase]\n', ''));
  });
});

describe(appendEntry, () => {
  it('appends an entry with a flow-style stack', () => {
    const registry = parse(FIXTURE);
    appendEntry(registry, { name: 'delta', path: '~/repos/delta', repo: 'owner/delta', stack: ['vue'] });
    expect(serializeRegistry(registry)).toBe(
      `${FIXTURE}  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    stack: [vue]\n`,
    );
  });

  it('omits the stack key when the stack is empty', () => {
    const registry = parse(FIXTURE);
    appendEntry(registry, { name: 'delta', path: '~/repos/delta', repo: 'owner/delta', stack: [] });
    expect(serializeRegistry(registry)).toBe(
      `${FIXTURE}  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n`,
    );
  });
});

describe(saveRegistry, () => {
  it('writes through a symlink to its target, leaving the link in place', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const { dir } = tree;
    const target = tree.write('real/repos.yaml', FIXTURE);
    const link = `${dir}/repos.yaml`;
    fs.symlinkSync(target, link);
    const registry = parse(FIXTURE);
    writeStack(registry, entry(registry, 'gamma'), []);
    saveRegistry(registry, link);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).not.toContain('supabase');
    expect(fs.readdirSync(`${dir}/real`)).toStrictEqual(['repos.yaml']);
  });
});

// region | Helpers

/** Returns the entry of a registry by name, failing the test when it is absent. */
function entry(registry: Registry, name: string): Registry['entries'][number] {
  const found = registry.entries.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`fixture has no entry ${name}`);
  return found;
}

/** Returns the names of the given entries. */
function names(entries: readonly { name: string | undefined }[]): (string | undefined)[] {
  return entries.map((candidate) => candidate.name);
}

/** Parses registry text, failing the test when it is refused. */
function parse(text: string): Registry {
  const registry = parseRegistry(text);
  if (typeof registry === 'string') throw new Error(registry);
  return registry;
}

// endregion | Helpers
