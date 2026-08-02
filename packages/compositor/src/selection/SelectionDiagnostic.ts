import type { Id, KindId } from '../schemas/common.ts';

/**
 * Where in a config something was declared, so a diagnostic reaches the entry an author wrote.
 *
 * `list` and `index` are absent together when the whole block is at fault rather than one entry in it.
 */
export interface ConfigEntryRef {
  readonly tierId: Id;
  readonly kindId: KindId;
  readonly list?: 'use' | 'drop';
  readonly index?: number;
}

/** One selector that named something the catalog does not carry. */
export interface SelectionDiagnostic {
  readonly code: 'unknown-artifact' | 'unknown-kind' | 'unknown-source' | 'empty-source';
  readonly message: string;
  readonly at: ConfigEntryRef;
}
