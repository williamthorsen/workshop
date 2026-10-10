import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { type Document, isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml';

/** One entry of the registry, with the YAML node from which it was read. */
export interface RegistryEntry {
  name: string | undefined;
  node: YAMLMap;
  path: string | undefined;
  repo: string | undefined;
  stack: string[];
  tags: string[];
}

/** A parsed registry: its document, kept for writing back, and its entries in file order. */
export interface Registry {
  document: Document;
  entries: RegistryEntry[];
}

/** The fields of an entry that `appendEntry` writes. */
export interface NewEntry {
  name: string;
  path: string;
  repo: string;
  stack: readonly string[];
}

/** Narrows the entries to those whose `tags` contains `tag` and whose `stack` contains `stack`, each when given. */
export interface EntrySelection {
  stack?: string | undefined;
  tag?: string | undefined;
}

/** Adds an entry under `repos`, writing `stack` only when it is non-empty. */
export function appendEntry(registry: Registry, entry: NewEntry): void {
  const fields: Record<string, unknown> = { name: entry.name, path: entry.path, repo: entry.repo };
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

/** Parses a registry file, or returns a message naming why its content is not a registry. */
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
  return { document, entries };
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

/** Writes the registry beside its file and renames it into place, keeping the flow lists unpadded. */
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
      (selection.stack === undefined || entry.stack.includes(selection.stack)),
  );
}

/** Returns the registry's text as `saveRegistry` writes it. */
export function serializeRegistry(registry: Registry): string {
  return registry.document.toString({ flowCollectionPadding: false });
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

/** Reports whether two lists hold the same strings in the same order. */
function isSameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Reads the typed fields of one entry, or returns a message naming the first field that is malformed. */
function readEntry(node: YAMLMap): RegistryEntry | string {
  const problems: string[] = [];
  const entry: RegistryEntry = {
    name: readString('name'),
    node,
    path: readString('path'),
    repo: readString('repo'),
    stack: readStringList('stack'),
    tags: readStringList('tags'),
  };
  return problems[0] ?? entry;

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

// endregion | Helpers
