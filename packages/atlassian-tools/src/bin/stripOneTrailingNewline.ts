/**
 * Drops the newline that a shell adds to a piped value, leaving one written without a terminator untouched.
 *
 * @internal
 */
export function stripOneTrailingNewline(input: string): string {
  return input.replace(/\r?\n$/, '');
}
