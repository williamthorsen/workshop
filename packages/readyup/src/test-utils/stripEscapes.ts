/** Matches an SGR escape sequence, the only kind that rendered output contains. */
const SGR_SEQUENCE = /\u001B\[[\d;]*m/gu;

/** Returns `text` without its SGR escape sequences. */
export function stripEscapes(text: string): string {
  return text.replaceAll(SGR_SEQUENCE, '');
}
