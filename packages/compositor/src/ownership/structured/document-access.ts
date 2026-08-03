/** Document access: the one place a structured host's format decides how it is read, edited, and written back. */

import { type Document, isCollection, isNode, isSeq, parseDocument, YAMLSeq } from 'yaml';

import type { OwnedItemsSpec } from './OwnedItemsSpec.ts';

/**
 * One item of a collection, held in whatever form its document keeps it.
 *
 * Opaque on purpose. A YAML item is a node carrying its own comments, and passing a foreign item back through as that
 * same node is what keeps its comments alive across an ensure pass; rebuilding it from plain data would silently drop
 * them. Reading an item as data goes through `toPlain`, which is all the sentinel check needs.
 */
export type ItemHandle = unknown;

/** What sits at a declared path: nothing, a collection, or a value that is neither. */
export type CollectionRead =
  | { readonly state: 'absent' }
  | { readonly state: 'collection'; readonly items: ReadonlyArray<ItemHandle> }
  | { readonly state: 'other' };

/** A parsed host, addressed by paths and rendered back in its own formatting. */
export interface DocumentAccess {
  readCollection(path: ReadonlyArray<string>): CollectionRead;
  removeCollection(path: ReadonlyArray<string>): void;
  serialize(): string;
  toHandle(value: unknown): ItemHandle;
  toPlain(item: ItemHandle): unknown;
  writeCollection(path: ReadonlyArray<string>, items: ReadonlyArray<ItemHandle>): void;
}

/**
 * Parses `content` for editing, or reports why it cannot be parsed.
 *
 * A host that will not parse is a fact about the destination, so the reason travels back to the caller as a blocked
 * file rather than as an exception. Blank content opens as an empty document, which is what lets a host be created
 * where none existed.
 */
export function openDocument(
  content: string,
  format: OwnedItemsSpec['format'],
): { readonly document: DocumentAccess } | { readonly reason: string } {
  return format === 'yaml' ? openYamlDocument(content) : openJsonDocument(content);
}

// region | Helpers

/** The formatting a JSON host is written back in, so an edit does not reformat what it did not touch. */
interface JsonFormat {
  readonly indent: string | number;
  readonly trailingNewline: boolean;
}

/**
 * Reads the indent unit from the first indented line.
 *
 * A document holding members on a single line demonstrates compact style and is written back compactly; anything else
 * falls back to two spaces, which is what a host created from scratch gets.
 */
function detectJsonFormat(content: string): JsonFormat {
  const body = content.trim();
  const isEmptyDocument = ['', '{}', '[]'].includes(body);
  const trailingNewline = content.endsWith('\n') || body === '';
  const indented = /\n([ \t]+)\S/.exec(content);
  if (indented?.[1] !== undefined) {
    return { indent: indented[1], trailingNewline };
  }
  return { indent: !isEmptyDocument && !body.includes('\n') ? 0 : 2, trailingNewline };
}

/** True for a plain object, the only shape a collection path descends through. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a YAML item back as the data a sentinel check compares, leaving a value that is not a node as it is. */
function readYamlNode(item: ItemHandle): unknown {
  if (!isNode(item)) {
    return item;
  }
  const plain: unknown = item.toJSON();
  return plain;
}

/** Builds access to a JSON host, where an item is a plain value and formatting is reproduced from the source text. */
function openJsonDocument(content: string): { readonly document: DocumentAccess } | { readonly reason: string } {
  const format = detectJsonFormat(content);
  let root: unknown = {};
  if (content.trim() !== '') {
    try {
      root = JSON.parse(content);
    } catch (error: unknown) {
      return { reason: `The host is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  function readAt(path: ReadonlyArray<string>): unknown {
    let cursor = root;
    for (const key of path) {
      if (!isRecord(cursor)) {
        return undefined;
      }
      cursor = cursor[key];
    }
    return cursor;
  }

  return {
    document: {
      readCollection(path) {
        const value = readAt(path);
        if (value === undefined || value === null) {
          return { state: 'absent' };
        }
        return Array.isArray(value) ? { state: 'collection', items: value } : { state: 'other' };
      },
      removeCollection(path) {
        for (let depth = path.length; depth > 0; depth--) {
          const parent = readAt(path.slice(0, depth - 1));
          const key = path[depth - 1];
          if (!isRecord(parent) || key === undefined) {
            return;
          }
          Reflect.deleteProperty(parent, key);
          if (Object.keys(parent).length > 0) {
            return;
          }
        }
      },
      serialize() {
        return JSON.stringify(root, undefined, format.indent) + (format.trailingNewline ? '\n' : '');
      },
      toHandle: (value) => value,
      toPlain: (item) => item,
      writeCollection(path, items) {
        const ancestors = path.slice(0, -1);
        let cursor = root;
        for (const key of ancestors) {
          if (!isRecord(cursor)) {
            return;
          }
          cursor[key] ??= {};
          cursor = cursor[key];
        }
        const key = path.at(-1);
        if (isRecord(cursor) && key !== undefined) {
          cursor[key] = [...items];
        }
      },
    },
  };
}

/** Builds access to a YAML host through the comment-preserving `Document` API. */
function openYamlDocument(content: string): { readonly document: DocumentAccess } | { readonly reason: string } {
  const doc: Document = parseDocument(content);
  if (doc.errors.length > 0) {
    return { reason: `The host is not valid YAML: ${doc.errors.map((error) => error.message).join('; ')}` };
  }

  function readAt(path: ReadonlyArray<string>): unknown {
    return path.length === 0 ? doc.contents : doc.getIn(path, true);
  }

  return {
    document: {
      readCollection(path) {
        const node = readAt(path);
        if (node === undefined || node === null) {
          return { state: 'absent' };
        }
        return isSeq(node) ? { state: 'collection', items: node.items } : { state: 'other' };
      },
      removeCollection(path) {
        doc.deleteIn(path);
        for (let depth = path.length - 1; depth > 0; depth--) {
          const ancestorPath = path.slice(0, depth);
          const ancestor = doc.getIn(ancestorPath, true);
          if (!isCollection(ancestor) || ancestor.items.length > 0) {
            return;
          }
          doc.deleteIn(ancestorPath);
        }
      },
      serialize: () => doc.toString(),
      toHandle: (value) => doc.createNode(value),
      toPlain: readYamlNode,
      writeCollection(path, items) {
        const existing = readAt(path);
        if (isSeq(existing)) {
          existing.items = [...items];
          return;
        }
        const seq = new YAMLSeq();
        seq.items = [...items];
        doc.setIn(path, seq);
      },
    },
  };
}

// endregion | Helpers
