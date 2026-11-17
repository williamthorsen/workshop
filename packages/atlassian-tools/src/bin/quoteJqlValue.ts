/**
 * Quotes a value as a JQL string, escaping the characters that would end or escape it.
 *
 * @internal
 */
export function quoteJqlValue(value: string): string {
  return `"${value.replaceAll(/["\\]/g, (character) => `\\${character}`)}"`;
}
