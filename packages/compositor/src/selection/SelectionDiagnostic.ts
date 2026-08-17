import type { Id, KindId } from '../schemas/scalar-schemas.ts';

/**
 * Where in a config something was declared, so a diagnostic reaches the entry an author wrote.
 *
 * `list` and `index` are absent together when the whole block is at fault rather than one entry in it. `inlayName` is
 * present for an entry under an `inlays` binding and absent for one under `select`, the two blocks sharing a selector
 * grammar and so sharing every diagnostic a selector can earn.
 */
export interface ConfigEntryRef {
  readonly tierId: Id;
  readonly kindId: KindId;
  readonly inlayName?: string;
  readonly list?: 'use' | 'drop';
  readonly index?: number;
}

/** One selector that named something the catalog does not carry. */
export interface SelectionDiagnostic {
  readonly code: 'unknown-artifact' | 'unknown-kind' | 'unknown-source' | 'empty-source';
  readonly message: string;
  readonly at: ConfigEntryRef;
}
