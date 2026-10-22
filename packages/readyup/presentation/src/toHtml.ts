/** The escape character that opens every SGR sequence. */
const ESCAPE = '\u{1B}';

/** Matches an SGR escape sequence, capturing its parameters. */
const SGR_SEQUENCE = new RegExp(String.raw`${ESCAPE}\[([\d;]*)m`, 'gu');

/** The class that each colour parameter in rich output selects. */
const COLOR_CLASSES: ReadonlyMap<number, string> = new Map([
  [31, 'sgr-red'],
  [32, 'sgr-green'],
  [33, 'sgr-yellow'],
  [90, 'sgr-gray'],
]);

/** Text attributes in effect at a point in the output. */
interface SgrState {
  bold: boolean;
  color: string | undefined;
  dim: boolean;
}

/** Returns `text` escaped for insertion into HTML. */
export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

/**
 * Returns terminal text as HTML, each run of styled text in a `<span>` whose classes name its attributes.
 *
 * Every span closes before the next run starts, so the result nests inside any element. A parameter that rich output
 * does not emit is ignored.
 */
export function toHtml(text: string): string {
  const state: SgrState = { bold: false, color: undefined, dim: false };
  let html = '';
  let position = 0;

  for (const match of text.matchAll(SGR_SEQUENCE)) {
    html += wrapRun(text.slice(position, match.index), state);
    applyParameters(state, match[1] ?? '');
    position = match.index + match[0].length;
  }

  return html + wrapRun(text.slice(position), state);
}

// region | Helpers

/** Updates `state` in place with each parameter of one SGR sequence, an empty list meaning a reset. */
function applyParameters(state: SgrState, parameters: string): void {
  const codes = parameters.split(';').map(Number);
  for (const code of codes) {
    switch (code) {
      case 0:
        state.bold = false;
        state.color = undefined;
        state.dim = false;
        break;
      case 1:
        state.bold = true;
        break;
      case 2:
        state.dim = true;
        break;
      case 22:
        state.bold = false;
        state.dim = false;
        break;
      case 39:
        state.color = undefined;
        break;
      default:
        state.color = COLOR_CLASSES.get(code) ?? state.color;
    }
  }
}

/** Returns one run of text escaped, inside a span naming `state`'s attributes when it has any. */
function wrapRun(run: string, state: SgrState): string {
  if (run === '') return '';
  const classes = [state.bold && 'sgr-bold', state.color, state.dim && 'sgr-dim'].filter(
    (name): name is string => typeof name === 'string',
  );
  const escaped = escapeHtml(run);
  return classes.length > 0 ? `<span class="${classes.join(' ')}">${escaped}</span>` : escaped;
}

// endregion | Helpers
