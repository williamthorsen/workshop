/** Owned items: where an engine's items sit inside a structured host, and what a target declares to own them. */

import { z } from 'zod';

/**
 * The key path within an item, and the value at it, that marks the item as the engine's.
 *
 * A sentinel in the data rather than a comment fence, because interleaved ownership has no contiguous span a fence
 * could delimit, and because JSON carries no comments at all. Data rather than a predicate, because a declaration a
 * consumer authors has to survive being read from a file.
 *
 * A `*` segment stands for every element of the array at that position, and a `contains` match claims a string holding
 * the value rather than one equal to it. Together they reach a mark a host buries inside a list of command strings,
 * which is where a tool that had to survive shell execution put its own. Neither names a place the engine can write, so
 * a sentinel using either requires its items to carry the mark already rather than stamping them.
 */
export const OwnedItemsSentinelSchema = z
  .object({
    path: z.array(z.string()).min(1),
    value: z.string().min(1),
    match: z.enum(['contains', 'equals']).optional(),
  })
  .meta({ id: 'OwnedItemsSentinel' });

/** Where an engine's items live inside a structured host, and how they are told apart from another tool's. */
export const OwnedItemsSpecSchema = z
  .object({
    format: z.enum(['json', 'yaml']),
    /** Path to the collection holding the items, from the document's root, naming at least one key. */
    collection: z.array(z.string()).min(1),
    sentinel: OwnedItemsSentinelSchema,
  })
  .meta({ id: 'OwnedItemsSpec' });

/**
 * One collection of items a target owns inside a structured host, with the items themselves.
 *
 * Entries ownership is target-level content rather than an artifact deployment: what a consumer owns in a host is a
 * function of the target, not of which artifacts a config selects, so no kind routes here and the items are declared
 * outright. A host keyed per event is reached by enumerating one declaration per collection, which is what spares the
 * declaration a templating grammar.
 *
 * The division against the region form is by shape. A contiguous owned run belongs to a region, whose fence delimits it
 * in the bytes and preserves the host's formatting; an interleaved one belongs here, where no fence could mark the
 * boundary and only a sentinel tells one tool's items from another's.
 */
export const OwnedItemsDeclarationSchema = OwnedItemsSpecSchema.extend({
  host: z.string().min(1),
  items: z.array(z.unknown()),
}).meta({ id: 'OwnedItemsDeclaration' });

export type OwnedItemsDeclaration = z.infer<typeof OwnedItemsDeclarationSchema>;
export type OwnedItemsSentinel = z.infer<typeof OwnedItemsSentinelSchema>;
export type OwnedItemsSpec = z.infer<typeof OwnedItemsSpecSchema>;
