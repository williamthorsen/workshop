/** Symbols a kit imports through one specifier that the runner's matching entry point does not export. */
export interface MissingImports {
  specifier: string;
  names: string[];
}

/** What a kit asked the running readyup for and did not get. */
export interface UnresolvableImports {
  /** `readyup` subpaths the runner does not publish, so nothing they name can resolve. */
  unknownSubpaths: string[];

  missing: MissingImports[];
}

/**
 * A compiled kit binding readyup symbols the running readyup cannot supply.
 *
 * Carries findings rather than a composed message: the remedy depends on where the kit came from, which only the
 * boundary that resolved the kit knows.
 */
export class UnresolvableKitImportsError extends Error {
  readonly findings: UnresolvableImports;

  constructor(findings: UnresolvableImports) {
    super('Kit imports readyup symbols the runner does not export');
    this.name = 'UnresolvableKitImportsError';
    this.findings = findings;
  }
}
