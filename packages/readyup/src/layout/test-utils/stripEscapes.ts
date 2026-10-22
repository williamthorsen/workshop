/** The escape character that opens every SGR sequence. */
const ESCAPE = '\u{1B}';

/** Matches an SGR escape sequence, the only kind that rendered output contains. */
const SGR_SEQUENCE = new RegExp(String.raw`${ESCAPE}\[[\d;]*m`, 'gu');

/** Returns `text` without its SGR escape sequences. */
export function stripEscapes(text: string): string {
  return text.replaceAll(SGR_SEQUENCE, '');
}
