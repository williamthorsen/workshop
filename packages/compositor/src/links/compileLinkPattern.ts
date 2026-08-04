/**
 * Compiles a declared link grammar into the expression the rewrite matches with.
 *
 * The engine supplies the flags. `g` finds every link on a line, and it is the whole of what a declaration may widen
 * to: matching runs a line at a time, so a grammar whose character classes admit a newline cannot run away from a
 * stray opening delimiter and swallow the lines beneath it. `d` reports where each capture sat, which is what lets the
 * rewrite replace the target's own characters and leave the rest of the link untouched -- so a declaration states the
 * grammar and never how a link is put back together.
 */
export function compileLinkPattern(pattern: string): RegExp {
  return new RegExp(pattern, 'gd');
}
