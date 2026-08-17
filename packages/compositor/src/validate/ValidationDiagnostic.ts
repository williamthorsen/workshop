import type { BindingDiagnostic } from '../inlays/BindingDiagnostic.ts';
import type { InlayDiagnostic } from '../inlays/InlayDiagnostic.ts';
import type { RenderDiagnostic } from '../render/RenderDiagnostic.ts';
import type { ClosureDiagnostic } from '../schemas/closure-schemas.ts';
import type { ArtifactId, KindId, TargetId } from '../schemas/scalar-schemas.ts';
import type { SelectionDiagnostic } from '../selection/SelectionDiagnostic.ts';
import type { TransclusionDiagnostic } from '../transclusion/TransclusionDiagnostic.ts';

/**
 * Where a destination two of a target's deployments contend for sits, with what each brings to it.
 *
 * `kindIds` names the deployments at fault, one per kind, and `artifactIds` the content they would write. Both are in
 * id order. The kinds are what an author changes to resolve the collision; the artifacts are what would be lost.
 */
export interface DeploymentRef {
  readonly targetId: TargetId;
  /** Posix-separated and relative to the target's root. */
  readonly path: string;
  readonly kindIds: ReadonlyArray<KindId>;
  readonly artifactIds: ReadonlyArray<ArtifactId>;
}

/** One destination more than one of a target's deployments writes, which no declaration decides between. */
export interface DeploymentDiagnostic {
  readonly code: 'destination-collision';
  readonly message: string;
  readonly at: DeploymentRef;
}

/** Where a render fault sits: the artifact whose content carries it, and the target it was being rendered for. */
export interface RenderRef {
  readonly targetId: TargetId;
  readonly artifactId: ArtifactId;
}

/**
 * One authoring fault, tagged with the domain that found it.
 *
 * Each domain's own diagnostic rides along unchanged, keeping the location that domain gives it: a selector at the
 * config entry an author wrote, a frontmatter edge at the artifact carrying it, a directive at the line it occupies, a
 * token or a link at the artifact hosting it. Wrapping rather than flattening is what keeps a reader able to reach the
 * file an author would open, which one merged shape could only approximate.
 *
 * Transclusion and inlays stand apart from the other render faults because they are a different kind of event: a
 * directive that cannot be read ends the render, while a token or a link that cannot be rewritten travels beside the
 * content that was produced anyway. They stand apart from each other because each locates its fault differently -- a
 * transclusion directive in the file an author wrote it in, an inlay directive in the body it was rendered into.
 *
 * A binding carries no `at` of its own here, unlike every other located domain, because its diagnostic already knows
 * where it belongs: a fault the config alone commits sits at the config, and one a target commits names the target and
 * the site. A `RenderRef` wrapper would have to be empty for the first of those.
 */
export type ValidationDiagnostic =
  | { readonly domain: 'selection'; readonly diagnostic: SelectionDiagnostic }
  | { readonly domain: 'closure'; readonly diagnostic: ClosureDiagnostic }
  | { readonly domain: 'transclusion'; readonly at: RenderRef; readonly diagnostic: TransclusionDiagnostic }
  | { readonly domain: 'inlay'; readonly at: RenderRef; readonly diagnostic: InlayDiagnostic }
  | { readonly domain: 'binding'; readonly diagnostic: BindingDiagnostic }
  | { readonly domain: 'render'; readonly at: RenderRef; readonly diagnostic: RenderDiagnostic }
  | { readonly domain: 'deployment'; readonly diagnostic: DeploymentDiagnostic };

/**
 * Every authoring fault a config and the content it reaches carry.
 *
 * A list rather than a per-domain shape, because a reader fixing mistakes works through them and the domain each
 * carries is what groups them. An empty list is a composition with nothing wrong in it.
 */
export interface ValidationReport {
  readonly diagnostics: ReadonlyArray<ValidationDiagnostic>;
}
