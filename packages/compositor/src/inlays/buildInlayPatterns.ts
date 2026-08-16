import type { DirectiveSyntax } from '../schemas/render-target-schemas.ts';

/** The line patterns one comment syntax's inlay directives match, each anchored to a whole line. */
export interface InlayPatterns {
  /** Matches any line shaped like an inlay directive, so a malformed one is rejected rather than emitted as text. */
  readonly anyInlay: RegExp;
  /** Captures the name of a well-formed directive. */
  readonly inlay: RegExp;
}

/**
 * Builds the patterns that recognize `syntax`'s inlay directives.
 *
 * The engine supplies the `inlay` keyword and owns nothing else about the shape, so a source of Markdown and a source
 * of shell scripts declare the same directive behind their own comment markers.
 *
 * Matching ignores the horizontal whitespace around a directive, on the same reasoning a region's markers are found
 * by: a formatter that indented the line must not thereby make it unfindable.
 */
export function buildInlayPatterns(syntax: DirectiveSyntax): InlayPatterns {
  const open = RegExp.escape(syntax.open);
  const close = RegExp.escape(syntax.close);
  const lead = String.raw`^[ \t]*${open}[ \t]*`;

  return {
    anyInlay: new RegExp(String.raw`${lead}inlay:[ \t]*.*${close}[ \t]*$`),
    inlay: new RegExp(String.raw`${lead}inlay:[ \t]*(\S+)[ \t]*${close}[ \t]*$`),
  };
}
