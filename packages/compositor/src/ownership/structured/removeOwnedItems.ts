import type { OwnershipOutcome } from '../OwnershipOutcome.ts';
import { openDocument } from './document-access.ts';
import { locateCollection } from './locateCollection.ts';
import type { OwnedItemsSpec } from './OwnedItemsSpec.ts';
import { carriesSentinel } from './sentinel.ts';

/**
 * Deletes every item the engine owns from a structured host, then prunes the structure the deletion emptied.
 *
 * A collection left holding foreign items survives with those items alone; one left holding nothing is removed, along
 * with any ancestor the removal emptied. An ancestor still carrying other keys stays.
 *
 * A host carrying no owned items is returned untouched rather than re-serialized, so removing nothing writes nothing.
 */
export function removeOwnedItems(content: string, spec: OwnedItemsSpec): OwnershipOutcome {
  const opened = openDocument(content, spec.format);
  if ('reason' in opened) {
    return { blocked: { reason: opened.reason } };
  }

  const { document } = opened;
  const located = locateCollection(document, spec.collection);
  if ('blocked' in located) {
    return located;
  }
  if ('absent' in located) {
    return { content };
  }

  const kept = located.items.filter((item) => !carriesSentinel(document.toPlain(item), spec.sentinel));
  if (kept.length === located.items.length) {
    return { content };
  }

  if (kept.length > 0) {
    document.writeCollection(spec.collection, kept);
  } else {
    document.removeCollection(spec.collection);
  }
  return { content: document.serialize() };
}
