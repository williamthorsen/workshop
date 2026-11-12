import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { type Document, isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml';

/** One entry of the registry, with the YAML node from which it was read. */
export interface RegistryEntry {
  formerPaths: string[];
  name: string | undefined;
  node: YAMLMap;
  path: string | undefined;
  prefix: string | undefined;
  repo: string | undefined;
  runner: string | undefined;
  stack: string[];
  tags: string[];
  visibility: string | undefined;
}

/** A parsed registry: its document, kept for writing back, and its entries in file order. */
export interface Registry {
  document: Document;
  entries: RegistryEntry[];
}

/** The fields of an entry that `appendEntry` writes. */
export interface NewEntry extends Partial<GitHubFields> {
  name: string;
  path: string;
  repo: string | undefined;
  stack: readonly string[];
}

/** The fields of an entry that are derived from GitHub. */
export interface GitHubFields {
  runner: string | undefined;
  visibility: string | undefined;
}

/**
 * Narrows the entries to those whose `tags` contains `tag`, whose `stack` contains `stack`, and whose `runner` and
 * `visibility` equal the given values, each when given.
 */
export interface EntrySelection {
  runner?: string | undefined;
  stack?: string | undefined;
  tag?: string | undefined;
  visibility?: string | undefined;
}

/** Adds an entry under `repos`, writing `repo`, `visibility`, `runner`, and `stack` only when each has a value. */
export function appendEntry(registry: Registry, entry: NewEntry): void {
  const fields: Record<string, unknown> = { name: entry.name, path: entry.path };
  if (entry.repo !== undefined) fields['repo'] = entry.repo;
  if (entry.visibility !== undefined) fields['visibility'] = entry.visibility;
  if (entry.runner !== undefined) fields['runner'] = entry.runner;
  if (entry.stack.length > 0) fields['stack'] = [...entry.stack];
  const node = registry.document.createNode(fields);
  if (isMap(node)) {
    const stack = node.get('stack', true);
    if (isSeq(stack)) stack.flow = true;
  }
  const repos = registry.document.get('repos', true);
  if (isSeq(repos)) {
    repos.add(node);
  } else {
    registry.document.set('repos', registry.document.createNode([node]));
  }
}

/**
 * Returns a message refusing a write to a file whose resolved path is in a checkout on the `live` branch, or
 * `undefined` when the write may proceed. A file outside any git checkout may be written.
 */
export function assertWritable(file: string, readBranch: (dir: string) => string | undefined): string | undefined {
  let resolved: string;
  try {
    resolved = fs.realpathSync(file);
  } catch {
    return undefined;
  }
  if (readBranch(path.dirname(resolved)) !== 'live') return undefined;
  return `${file} resolves to ${resolved}, which is in a worktree on the live branch; pass --file <branch worktree copy> to write the registry in a branch worktree`;
}

/**
 * Parses a registry file, or returns a message naming why its content is not a registry, which includes two entries
 * whose prefixes are equal regardless of case.
 */
export function parseRegistry(text: string): Registry | string {
  const document = parseDocument(text);
  if (document.errors.length > 0) return document.errors[0]?.message ?? 'invalid YAML';

  const repos = document.get('repos', true);
  if (repos === undefined || (isScalar(repos) && repos.value === null)) return { document, entries: [] };
  if (!isSeq(repos)) return "'repos' is not a list";

  const entries: RegistryEntry[] = [];
  for (const [index, item] of repos.items.entries()) {
    if (!isMap(item)) return `entry ${index + 1} is not a mapping`;
    const entry = readEntry(item);
    if (typeof entry === 'string') return `entry ${index + 1}: ${entry}`;
    entries.push(entry);
  }
  return findDuplicatePrefix(entries) ?? { document, entries };
}

/** Reads and parses a registry file, or returns a message naming why it cannot. */
export function readRegistry(file: string): Registry | string {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return `registry not found: ${file}`;
  }
  const registry = parseRegistry(text);
  return typeof registry === 'string' ? `cannot read the registry ${file}: ${registry}` : registry;
}

/**
 * Sets an entry's `path` to `newPath` and appends the path that it replaces to `formerPaths`, a flow list placed after
 * `path` when the entry lacks one. A former path equal to `newPath`, or already in the list, is not appended.
 */
export function recordMove(registry: Registry, entry: RegistryEntry, newPath: string): void {
  const oldPath = entry.path;
  writeScalar(entry.node, 'path', newPath, ['name']);
  entry.path = newPath;
  if (oldPath === undefined || oldPath === newPath || entry.formerPaths.includes(oldPath)) return;

  const formerPaths = [...entry.formerPaths, oldPath];
  const existing = entry.node.get('formerPaths', true);
  if (isSeq(existing)) {
    existing.add(registry.document.createNode(oldPath));
  } else {
    const node = registry.document.createNode(formerPaths);
    node.flow = true;
    entry.node.set('formerPaths', node);
    moveKeyAfter(entry.node, 'formerPaths', 'path');
  }
  entry.formerPaths = formerPaths;
}

/** Writes the registry beside its file and renames it into place, in the form that `serializeRegistry` returns. */
export function saveRegistry(registry: Registry, file: string): void {
  const resolved = fs.realpathSync(file);
  const temporary = `${resolved}.${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(temporary, serializeRegistry(registry), { flag: 'wx' });
  fs.renameSync(temporary, resolved);
}

/** Returns the entries that the selection matches, in file order. */
export function selectEntries(entries: readonly RegistryEntry[], selection: EntrySelection): RegistryEntry[] {
  return entries.filter(
    (entry) =>
      (selection.tag === undefined || entry.tags.includes(selection.tag)) &&
      (selection.stack === undefined || entry.stack.includes(selection.stack)) &&
      (selection.visibility === undefined || entry.visibility === selection.visibility) &&
      (selection.runner === undefined || entry.runner === selection.runner),
  );
}

/** Returns the registry's text, with each flow list unpadded and each value kept on one line, whatever its length. */
export function serializeRegistry(registry: Registry): string {
  return registry.document.toString({ flowCollectionPadding: false, lineWidth: 0 });
}

/**
 * Sets an entry's `visibility` and `runner`, removing a key whose value is `undefined`. A missing key is placed after
 * `repo`, with `runner` after `visibility`, and an existing key keeps its position.
 */
export function writeGitHubFields(entry: RegistryEntry, fields: GitHubFields): void {
  writeScalar(entry.node, 'visibility', fields.visibility, ['repo']);
  writeScalar(entry.node, 'runner', fields.runner, ['visibility', 'repo']);
  entry.visibility = fields.visibility;
  entry.runner = fields.runner;
}

/**
 * Sets an entry's `stack` as a flow list, or removes the key when the list is empty. An entry whose `stack` already
 * equals the list is left untouched, so that its formatting survives.
 */
export function writeStack(registry: Registry, entry: RegistryEntry, stack: readonly string[]): void {
  if (stack.length === 0) {
    entry.node.delete('stack');
  } else if (!isSameList(entry.stack, stack)) {
    const node = registry.document.createNode([...stack]);
    node.flow = true;
    entry.node.set('stack', node);
  }
  entry.stack = [...stack];
}

// region | Helpers

/** Names an entry by its 1-based position, followed by its name when it has one. */
function describeEntry(index: number, entry: RegistryEntry): string {
  return entry.name === undefined ? String(index + 1) : `${index + 1} (${entry.name})`;
}

/** Returns a message naming the first two entries whose prefixes are equal regardless of case, or `undefined`. */
function findDuplicatePrefix(entries: readonly RegistryEntry[]): string | undefined {
  const seen = new Map<string, { entry: RegistryEntry; index: number; prefix: string }>();
  for (const [index, entry] of entries.entries()) {
    if (entry.prefix === undefined) continue;
    const key = entry.prefix.toLowerCase();
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      return `entries ${describeEntry(earlier.index, earlier.entry)} and ${describeEntry(index, entry)} declare the same prefix: '${earlier.prefix}' and '${entry.prefix}'`;
    }
    seen.set(key, { entry, index, prefix: entry.prefix });
  }
  return undefined;
}

/** Reports whether two lists hold the same strings in the same order. */
function isSameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Moves a key of a map to the position after `anchor`, or leaves it last when the map lacks `anchor`. */
function moveKeyAfter(node: YAMLMap, key: string, anchor: string): void {
  const index = node.items.findIndex((pair) => readKey(pair.key) === key);
  const [moved] = index === -1 ? [] : node.items.splice(index, 1);
  if (moved === undefined) return;
  const anchorIndex = node.items.findIndex((pair) => readKey(pair.key) === anchor);
  node.items.splice(anchorIndex === -1 ? node.items.length : anchorIndex + 1, 0, moved);
}

/** Reads the typed fields of one entry, or returns a message naming the first field that is malformed. */
function readEntry(node: YAMLMap): RegistryEntry | string {
  const problems: string[] = [];
  const entry: RegistryEntry = {
    formerPaths: readStringList('formerPaths'),
    name: readString('name'),
    node,
    path: readString('path'),
    prefix: readPrefix(),
    repo: readString('repo'),
    runner: readString('runner'),
    stack: readStringList('stack'),
    tags: readStringList('tags'),
    visibility: readString('visibility'),
  };
  return problems[0] ?? entry;

  /** Returns the optional `prefix`, recording a problem when it is empty or contains whitespace or a period. */
  function readPrefix(): string | undefined {
    const value = readString('prefix');
    if (value !== undefined && (value === '' || /[\s.]/.test(value))) {
      problems.push(`'prefix' must be a non-empty string without whitespace or a period`);
      return undefined;
    }
    return value;
  }

  /** Returns an optional string field, recording a problem when it is present and not a string. */
  function readString(key: string): string | undefined {
    const value: unknown = node.get(key);
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    problems.push(`'${key}' is not a string`);
    return undefined;
  }

  /** Returns an optional list of strings, recording a problem when it is present and not one. */
  function readStringList(key: string): string[] {
    const value: unknown = node.get(key, true);
    if (value === undefined || (isScalar(value) && value.value === null)) return [];
    const items: unknown[] = isSeq(value) ? value.items.map((item) => (isScalar(item) ? item.value : item)) : [value];
    if (!isSeq(value) || items.some((item) => typeof item !== 'string')) {
      problems.push(`'${key}' is not a list of strings`);
      return [];
    }
    return items.filter((item) => typeof item === 'string');
  }
}

/** Returns the name of a map key: A parsed key is a `Scalar`, and a key added by `set` is the bare string. */
function readKey(key: unknown): unknown {
  return isScalar(key) ? key.value : key;
}

/**
 * Sets a scalar key of a map, or deletes it when `value` is `undefined`. A missing key is inserted after the first of
 * `anchors` that the map contains, else appended.
 */
function writeScalar(node: YAMLMap, key: string, value: string | undefined, anchors: readonly string[]): void {
  if (value === undefined) {
    node.delete(key);
    return;
  }
  if (node.has(key)) {
    if (node.get(key) !== value) node.set(key, value);
    return;
  }
  node.set(key, value);
  const added = node.items.pop();
  if (added === undefined) return;
  const anchor = anchors.find((name) => node.has(name));
  const anchorIndex = node.items.findIndex((pair) => readKey(pair.key) === anchor);
  node.items.splice(anchorIndex === -1 ? node.items.length : anchorIndex + 1, 0, added);
}

// endregion | Helpers
