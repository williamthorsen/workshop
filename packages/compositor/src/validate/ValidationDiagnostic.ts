import type { RenderDiagnostic } from '../render/RenderDiagnostic.ts';
import type { ClosureDiagnostic } from '../schemas/closure-schemas.ts';
import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';
import type { SelectionDiagnostic } from '../selection/SelectionDiagnostic.ts';
import type { TransclusionDiagnostic } from '../transclusion/TransclusionDiagnostic.ts';

/** Where a destination two artifacts contend for sits, with the artifacts contending for it in id order. */
export interface DeploymentRef {
  readonly targetId: TargetId;
  /** Posix-separated and relative to the target's root. */
  readonly path: string;
  readonly artifactIds: ReadonlyArray<ArtifactId>;
}

/** One destination more than one artifact of a target deploys to, which no declaration decides between. */
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
 * Transclusion stands apart from the other render faults because it is a different kind of event: a directive that
 * cannot be resolved ends the render, while a token or a link that cannot be rewritten travels beside the content that
 * was produced anyway.
 */
export type ValidationDiagnostic =
  | { readonly domain: 'selection'; readonly diagnostic: SelectionDiagnostic }
  | { readonly domain: 'closure'; readonly diagnostic: ClosureDiagnostic }
  | { readonly domain: 'transclusion'; readonly at: RenderRef; readonly diagnostic: TransclusionDiagnostic }
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
