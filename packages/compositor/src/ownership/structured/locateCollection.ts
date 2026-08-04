import type { FileBlock } from '../../schemas/file-schemas.ts';
import type { DocumentAccess, ItemHandle } from './document-access.ts';

/** Where a declared collection stands: the items it holds, nothing at all, or a refusal to read what is there. */
export type LocatedCollection =
  { readonly items: ReadonlyArray<ItemHandle> } | { readonly absent: true } | { readonly blocked: FileBlock };

/**
 * Locates the collection at `path`, keeping absent and wrong-shape apart.
 *
 * A value that is not a collection blocks rather than reading as empty, whether it sits at the path or anywhere along
 * it. Reading it as empty would have the engine write items beside a value the host understands as something else
 * entirely, which is the failure the ported original refused by throwing and this reports as a fact about the
 * destination.
 *
 * An empty path throws. It would name the document root, which reads as a collection but has no structure to prune a
 * removal down to, so the three operations could not agree on what it means.
 */
export function locateCollection(document: DocumentAccess, path: ReadonlyArray<string>): LocatedCollection {
  if (path.length === 0) {
    throw new Error('A collection path must name at least one key; the document root cannot be owned.');
  }

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
