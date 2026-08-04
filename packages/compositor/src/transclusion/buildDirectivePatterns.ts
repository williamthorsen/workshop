import type { DirectiveSyntax } from '../schemas/render-target-schemas.ts';

/** The line patterns one comment syntax's directives match, each anchored to a whole line. */
export interface DirectivePatterns {
  /** Matches any line shaped like an include directive, so a malformed one is rejected rather than emitted as text. */
  readonly anyInclude: RegExp;
  readonly children: RegExp;
  readonly close: RegExp;
  readonly open: RegExp;
  readonly selfClose: RegExp;
}

/**
 * Builds the patterns that recognize `syntax`'s directives.
 *
 * The engine supplies the `include`, `/include`, and `children` keywords and owns nothing else about the shape, so a
 * source of Markdown and a source of shell scripts declare the same directives behind their own comment markers.
 */
export function buildDirectivePatterns(syntax: DirectiveSyntax): DirectivePatterns {
  const open = RegExp.escape(syntax.open);
  const close = RegExp.escape(syntax.close);
  const lead = String.raw`^[ \t]*${open}[ \t]*`;
  const tail = String.raw`[ \t]*${close}[ \t]*$`;

  return {
    anyInclude: new RegExp(String.raw`${lead}include:[ \t]*.*${close}[ \t]*$`),
    children: new RegExp(`${lead}children${tail}`),
    close: new RegExp(String.raw`${lead}\/include${tail}`),
    open: new RegExp(String.raw`${lead}include:[ \t]*(\S+)${tail}`),
    selfClose: new RegExp(String.raw`${lead}include:[ \t]*(\S+?)[ \t]*\/${tail}`),
  };
}
