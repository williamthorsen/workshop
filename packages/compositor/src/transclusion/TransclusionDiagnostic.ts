/** Where a directive sits: the file containing it, relative to its source, and the line it occupies. */
export interface DirectiveRef {
  readonly path: string;
  readonly line: number;
}

/** One directive that stopped an expansion, located at the line an author wrote it on. */
export interface TransclusionDiagnostic {
  readonly code: TransclusionFailure;
  readonly message: string;
  readonly at: DirectiveRef;
}

/**
 * Why a directive could not be resolved.
 *
 * `not-found`, `out-of-tree`, and `cycle` are faults in what a directive names; the rest are faults in how or where the
 * directives are written, and are reported against the line containing the fault.
 */
export type TransclusionFailure =
  | 'cycle'
  | 'not-found'
  | 'orphan-children'
  | 'orphan-close'
  | 'out-of-tree'
  | 'slot-without-children'
  | 'unclosed-open'
  | 'unrecognized-parameter';
