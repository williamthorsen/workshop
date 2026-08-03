/**
 * Where an engine's items live inside a structured host, and how they are told apart from the items other tools wrote.
 *
 * This is the whole of what a consumer declares, and all of it is serializable data. A predicate would say the same
 * thing more flexibly and could not be written down, which is what rules it out: a declaration a consumer authors has
 * to survive being read from a file.
 */
export interface OwnedItemsSpec {
  readonly format: 'json' | 'yaml';
  /** Path to the collection holding the items, from the document's root. */
  readonly collection: ReadonlyArray<string>;
  /**
   * The key path within an item, and the value at it, that marks the item as the engine's.
   *
   * A sentinel in the data rather than a comment fence, because interleaved ownership has no contiguous span a fence
   * could delimit, and because JSON carries no comments at all.
   */
  readonly sentinel: { readonly path: ReadonlyArray<string>; readonly value: string };
}
