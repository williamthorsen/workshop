import type { LinkDiagnostic } from '../links/LinkDiagnostic.ts';
import type { TokenDiagnostic } from '../tokens/TokenDiagnostic.ts';

/**
 * One thing a stage could not render, tagged with the stage that reported it.
 *
 * Tagged rather than merged into one shape, because each stage locates a fault by what that stage reads -- a token by
 * the token as written, a link by its target -- and a caller attaching one to a plan has to know which it holds.
 */
export type RenderDiagnostic =
  | { readonly stage: 'links'; readonly diagnostic: LinkDiagnostic }
  | { readonly stage: 'tokens'; readonly diagnostic: TokenDiagnostic };
