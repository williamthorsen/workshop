import type { FileBlock } from '../../schemas/file-schemas.ts';
import type { DocumentAccess, ItemHandle } from './document-access.ts';

/** Where a declared collection stands: the items it holds, nothing at all, or a refusal to read what is there. */
export type LocatedCollection =
  { readonly items: ReadonlyArray<ItemHandle> } | { readonly absent: true } | { readonly blocked: FileBlock };

/**
 * Locates the collection at `path`, keeping absent and wrong-shape apart.
 *
 * A value that is not a collection blocks rather than reading as empty. Reading it as empty would have the engine
 * write items beside a value the host understands as something else entirely, which is the failure the ported original
 * refused by throwing and this reports as a fact about the destination.
 */
export function locateCollection(document: DocumentAccess, path: ReadonlyArray<string>): LocatedCollection {
  const read = document.readCollection(path);
  if (read.state === 'collection') {
    return { items: read.items };
  }
  if (read.state === 'absent') {
    return { absent: true };
  }
  return {
    blocked: {
      reason: `The host holds something other than a collection at "${path.join('.')}", so the engine cannot own items there.`,
    },
  };
}
