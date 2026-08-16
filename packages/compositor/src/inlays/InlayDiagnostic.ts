/** One inlay directive that stopped a render, located at the line it occupies in the rendered body. */
export interface InlayDiagnostic {
  readonly code: InlayFailure;
  readonly message: string;
  /** One-based, and into the rendered body rather than into the file an author wrote the directive in. */
  readonly line: number;
}

/**
 * Why an inlay directive could not be read.
 *
 * `unrecognized-parameter` is a line shaped like a directive that names no single inlay, the fault `anyInlay` exists
 * to catch rather than deploy as text. `duplicate-name` is one body declaring an inlay twice, which leaves a fill no
 * single place to go.
 */
export type InlayFailure = 'duplicate-name' | 'unrecognized-parameter';
