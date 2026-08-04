import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DeployableArtifact } from '../deployment/resolveDeployedNames.ts';
import { resolveDeployedPath } from '../deployment/resolveDeployedPath.ts';
import { mergeFrontmatter } from '../frontmatter/mergeFrontmatter.ts';
import { rewriteLinks } from '../links/rewriteLinks.ts';
import type { FileContributors } from '../schemas/file-schemas.ts';
import type { PartialEntry } from '../schemas/graph-schemas.ts';
import type { RenderStage, RenderTarget } from '../schemas/render-target-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';
import type { DeployedNameLookup } from '../tokens/rewriteTokens.ts';
import { rewriteTokens } from '../tokens/rewriteTokens.ts';
import type { Segment, TransclusionSource } from '../transclusion/expandTransclusions.ts';
import { expandTransclusions } from '../transclusion/expandTransclusions.ts';
import { joinSegments } from '../transclusion/joinSegments.ts';
import type { TransclusionDiagnostic } from '../transclusion/TransclusionDiagnostic.ts';
import type { RenderDiagnostic } from './RenderDiagnostic.ts';

/** Everything rendering one of an artifact's files for one target needs. */
export interface RenderArtifactInput {
  readonly artifact: DeployableArtifact;
  /** The file to render, relative to `source.dir`. */
  readonly entryPath: string;
  /** The file's path within the artifact's own directory, for a kind deploying as one. */
  readonly relPath?: string;
  readonly resolveDeployedName: DeployedNameLookup;
  readonly source: TransclusionSource;
  readonly target: RenderTarget;
  readonly tokenKinds: ReadonlyArray<TokenKind>;
}

/**
 * What rendering one artifact for one target produced.
 *
 * `not-deployed` is the target taking none of the artifact's kind, which is an answer rather than a fault: a caller
 * rendering every artifact for every target reaches it by walking the pairs.
 */
export type ArtifactRender =
  | {
      readonly status: 'rendered';
      readonly content: string;
      readonly contributors: FileContributors;
      readonly partials: ReadonlyArray<PartialEntry>;
      readonly diagnostics: ReadonlyArray<RenderDiagnostic>;
    }
  | { readonly status: 'failed'; readonly diagnostic: TransclusionDiagnostic }
  | { readonly status: 'not-deployed' };

/**
 * Runs the stages `target` declares over one artifact's file, in the order the engine fixes.
 *
 * Transclusion runs first, since every later stage reads the segments it produces and the attribution they carry. Link
 * rewriting runs before the token rewrite, so a link target opening with a token still carries the token the link stage
 * recognizes: a consumer writes `{name}` for a value to be inserted where it stands and `./{name}` for one to be
 * resolved against the file. The frontmatter overlay runs last, over the joined document, since it parses a block
 * rather than a run of lines and its values are already the target's own. Each ordering is load-bearing, which is why a
 * target declares which stages run and never their sequence.
 *
 * A target declaring no transclusion stage still has its file read: a body with no directives in it is one segment.
 *
 * A directive that cannot be resolved ends the render, since a cycle or a missing target leaves no body to carry on
 * with. Everything a later stage could not resolve comes back as a diagnostic beside the content, so a plan records the
 * file it would write next to the reasons it is incomplete. Frontmatter the overlay cannot be applied to throws, on the
 * reasoning that no reading of a malformed block lets the overlay apply and every alternative loses content.
 */
export async function renderArtifact(input: RenderArtifactInput): Promise<ArtifactRender> {
  const deployment = input.target.deployments.find((entry) => entry.kindId === input.artifact.kindId);
  const deployedName = input.resolveDeployedName(input.target.id, input.artifact.id);
  if (deployment === undefined || deployedName === undefined) {
    return { status: 'not-deployed' };
  }

  const expansion = await expand(input);
  if (expansion.status === 'failed') {
    return expansion;
  }

  const diagnostics: Array<RenderDiagnostic> = [];
  let segments = expansion.segments;

  const links = findStage(input.target, 'links');
  if (links !== undefined) {
    const rewrite = rewriteLinks({
      segments,
      pattern: links.pattern,
      tokenKinds: input.tokenKinds,
      filePath: resolveDeployedPath(deployment, deployedName, input.relPath),
      targetRoot: input.target.root,
      host: input.artifact.id,
    });
    segments = rewrite.segments;
    diagnostics.push(...rewrite.diagnostics.map((diagnostic) => ({ stage: 'links' as const, diagnostic })));
  }

  if (findStage(input.target, 'tokens') !== undefined) {
    const rewrite = rewriteTokens({
      segments,
      tokenKinds: input.tokenKinds,
      target: input.target,
      host: input.artifact.id,
      resolveDeployedName: input.resolveDeployedName,
    });
    segments = rewrite.segments;
    diagnostics.push(...rewrite.diagnostics.map((diagnostic) => ({ stage: 'tokens' as const, diagnostic })));
  }

  const frontmatter = findStage(input.target, 'frontmatter');
  const joined = joinSegments(segments);
  const content =
    frontmatter === undefined ? joined : mergeFrontmatter(joined, frontmatter.overlay, input.artifact.slug);

  return {
    status: 'rendered',
    content,
    contributors: {
      artifacts: [{ artifactId: input.artifact.id }],
      partials: expansion.partials.map((partial) => partial.id),
    },
    partials: expansion.partials,
    diagnostics,
  };
}

// region | Helpers

/** An expanded body with the partials it drew from, or the directive that stopped the expansion. */
type Expansion =
  | {
      readonly status: 'expanded';
      readonly segments: ReadonlyArray<Segment>;
      readonly partials: ReadonlyArray<PartialEntry>;
    }
  | { readonly status: 'failed'; readonly diagnostic: TransclusionDiagnostic };

/** Produces the segments the stages run over, reading the file directly for a target that transcludes nothing. */
async function expand(input: RenderArtifactInput): Promise<Expansion> {
  const stage = findStage(input.target, 'transclusion');
  if (stage !== undefined) {
    return expandTransclusions(input.entryPath, input.source, stage.syntax);
  }

  const content = await readFile(path.resolve(input.source.dir, input.entryPath), 'utf8');
  return { status: 'expanded', segments: [{ lines: content.split('\n') }], partials: [] };
}

/** Finds the stage of `kind` a target declares, narrowed to that stage's own parameters. */
function findStage<Kind extends RenderStage['kind']>(
  target: RenderTarget,
  kind: Kind,
): Extract<RenderStage, { kind: Kind }> | undefined {
  return target.stages.find((stage): stage is Extract<RenderStage, { kind: Kind }> => stage.kind === kind);
}

// endregion | Helpers
