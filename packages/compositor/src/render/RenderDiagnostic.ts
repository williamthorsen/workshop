import type { InlayDiagnostic } from '../inlays/InlayDiagnostic.ts';
import type { LinkDiagnostic } from '../links/LinkDiagnostic.ts';
import type { TokenDiagnostic } from '../tokens/TokenDiagnostic.ts';
import type { TransclusionDiagnostic } from '../transclusion/TransclusionDiagnostic.ts';

/**
 * One thing a stage could not render, tagged with the stage that reported it.
 *
 * Tagged rather than merged into one shape, because each stage locates a fault by what that stage reads -- a token by
 * the token as written, a link by its target -- and a caller attaching one to a plan has to know which it holds.
 */
export type RenderDiagnostic =
  | { readonly stage: 'links'; readonly diagnostic: LinkDiagnostic }
  | { readonly stage: 'tokens'; readonly diagnostic: TokenDiagnostic };

/**
 * The one fault that ended a render, tagged with the stage that raised it.
 *
 * Separate from `RenderDiagnostic` because it is a different kind of event: a token or a link that cannot be rewritten
 * travels beside the content produced anyway, while a directive that cannot be read leaves no body to carry on with.
 * Tagged for the same reason `RenderDiagnostic` is, the two stages locating a fault by what each of them reads.
 */
export type RenderFailure =
  | { readonly stage: 'inlay'; readonly diagnostic: InlayDiagnostic }
  | { readonly stage: 'transclusion'; readonly diagnostic: TransclusionDiagnostic };
