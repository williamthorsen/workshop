import type { OwnedItemsSpec } from '../../schemas/owned-items-schemas.ts';
import type { OwnershipOutcome } from '../OwnershipOutcome.ts';
import { type DocumentAccess, type ItemHandle, openDocument } from './document-access.ts';
import { locateCollection } from './locateCollection.ts';
import { applySentinel, carriesSentinel } from './sentinel.ts';

/**
 * Installs `items` as the engine's contribution to a structured host, leaving everything else in it alone.
 *
 * The owned subset of the collection is replaced wholesale: the supplied items are spliced in at the first owned
 * position, appended when the collection holds none, and every other owned item is dropped. That is one rule producing
 * four behaviours at once -- a re-run is a no-op, a drifted item is replaced in place, accidental duplicates collapse,
 * and foreign items keep their relative order.
 *
 * Each item carries the sentinel before it is written, so nothing reaches the host that could not be found again.
 * A sentinel the engine can write is stamped on; one it cannot is required of the item already, and an item
 * lacking it is refused. A collection the host does not carry is created, unless there is nothing to put in it.
 *
 * Content that needs no change is returned untouched rather than re-serialized, which is what keeps a re-run
 * byte-identical: re-emitting a parsed document reproduces its comments but not necessarily every formatting choice.
 */
export function ensureOwnedItems(
  content: string,
  spec: OwnedItemsSpec,
  items: ReadonlyArray<unknown>,
): OwnershipOutcome {
  const opened = openDocument(content, spec.format);
  if ('reason' in opened) {
    return { blocked: { reason: opened.reason } };
  }

  const { document } = opened;
  const located = locateCollection(document, spec.collection);
  if ('blocked' in located) {
    return located;
  }

  const desired = items.map((item) => document.toHandle(applySentinel(item, spec.sentinel)));

  if ('absent' in located) {
    if (desired.length === 0) {
      return { content };
    }
    document.writeCollection(spec.collection, desired);
    return { content: document.serialize() };
  }

  const merged = spliceOwned(located.items, desired, (item) => carriesSentinel(document.toPlain(item), spec.sentinel));
  if (readsIdentically(document, located.items, merged)) {
    return { content };
  }
  document.writeCollection(spec.collection, merged);
  return { content: document.serialize() };
}

// region | Helpers

/** True when two item lists carry the same data, which is how an ensure pass recognizes it has nothing to do. */
function readsIdentically(
  document: DocumentAccess,
  before: ReadonlyArray<ItemHandle>,
  after: ReadonlyArray<ItemHandle>,
): boolean {
  return renderItems(document, before) === renderItems(document, after);
}

/** Renders an item list as the data it holds, so two lists compare by content rather than by node identity. */
function renderItems(document: DocumentAccess, items: ReadonlyArray<ItemHandle>): string {
  return JSON.stringify(items.map((item) => document.toPlain(item)));
}

/**
 * Replaces the owned run of `current` with `desired`, splicing at the first owned position and appending when the
 * collection owns nothing yet. Foreign items keep their order on both sides of the splice.
 */
function spliceOwned(
  current: ReadonlyArray<ItemHandle>,
  desired: ReadonlyArray<ItemHandle>,
  carriesOwnership: (item: ItemHandle) => boolean,
): ReadonlyArray<ItemHandle> {
  const firstOwned = current.findIndex((item) => carriesOwnership(item));
  if (firstOwned === -1) {
    return [...current, ...desired];
  }
  return [
    ...current.slice(0, firstOwned),
    ...desired,
    ...current.slice(firstOwned + 1).filter((item) => !carriesOwnership(item)),
  ];
}

// endregion | Helpers
