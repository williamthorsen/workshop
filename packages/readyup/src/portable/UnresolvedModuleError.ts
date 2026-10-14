/** A module import that could not be resolved, described with the file that was being evaluated. */
export class UnresolvedModuleError extends Error {
  /** The remedy to show beside the message, when one applies. */
  readonly hint: string | undefined;

  constructor(message: string, options: { cause: unknown; hint?: string | undefined }) {
    super(message, { cause: options.cause });
    this.name = 'UnresolvedModuleError';
    this.hint = options.hint;
  }
}
