/**
 * Where an engine's items live inside a structured host, and how they are told apart from the items other tools wrote.
 *
 * This is the whole of what a consumer declares, and all of it is serializable data. A predicate would say the same
 * thing more flexibly and could not be written down, which is what rules it out: a declaration a consumer authors has
 * to survive being read from a file.
 */
export interface OwnedItemsSpec {
  readonly format: 'json' | 'yaml';
  /** Path to the collection holding the items, from the document's root, naming at least one key. */
  readonly collection: ReadonlyArray<string>;
  /**
   * The key path within an item, and the value at it, that marks the item as the engine's.
   *
   * A sentinel in the data rather than a comment fence, because interleaved ownership has no contiguous span a fence
   * could delimit, and because JSON carries no comments at all.
   *
   * A `*` segment stands for every element of the array at that position, and `match: 'contains'` claims a string
   * holding the value rather than one equal to it. Together they reach a mark a host buries inside a list of command
   * strings, which is where a tool that had to survive shell execution put its own. Neither names a place the engine
   * can write, so a sentinel using either requires its items to carry the mark already rather than stamping them.
   */
  readonly sentinel: {
    readonly path: ReadonlyArray<string>;
    readonly value: string;
    readonly match?: 'contains' | 'equals' | undefined;
  };
}
