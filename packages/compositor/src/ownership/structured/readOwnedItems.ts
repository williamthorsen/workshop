import type { FileBlock } from '../../schemas/file-schemas.ts';
import { openDocument } from './document-access.ts';
import { locateCollection } from './locateCollection.ts';
import type { OwnedItemsSpec } from './OwnedItemsSpec.ts';
import { carriesSentinel } from './sentinel.ts';

/** The engine's items as plain data, or the refusal to read them. */
export type OwnedItemsRead = { readonly items: ReadonlyArray<unknown> } | { readonly blocked: FileBlock };

/**
 * Reads the items the engine owns within a structured host, in the order the host holds them.
 *
 * A collection the host does not carry reads as no items rather than blocking, the engine simply owning nothing there
 * yet. A collection whose declared path holds something else does block, since that is a host a write would damage.
 */
export function readOwnedItems(content: string, spec: OwnedItemsSpec): OwnedItemsRead {
  const opened = openDocument(content, spec.format);
  if ('reason' in opened) {
    return { blocked: { reason: opened.reason } };
  }

  const located = locateCollection(opened.document, spec.collection);
  if ('blocked' in located) {
    return located;
  }
  if ('absent' in located) {
    return { items: [] };
  }

  return {
    items: located.items
      .map((item) => opened.document.toPlain(item))
      .filter((item) => carriesSentinel(item, spec.sentinel)),
  };
}
