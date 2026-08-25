/** Render targets: the target as the transform pipeline reads it, with where it deploys and the stages it runs. */

import { z } from 'zod';

import { KindLayoutSchema } from './kind-layout-schemas.ts';
import { OwnedItemsDeclarationSchema } from './owned-items-schemas.ts';
import { IdSchema } from './scalar-schemas.ts';
import { TargetEntrySchema } from './target-schemas.ts';

/**
 * The comment syntax a source writes its directives in, transclusion's and the inlay stage's alike.
 *
 * `close` is empty for a syntax whose comments run to the end of the line, such as `#`.
 */
export const DirectiveSyntaxSchema = z
  .object({
    open: z.string(),
    close: z.string(),
  })
  .meta({ id: 'DirectiveSyntax' });

/**
 * The metadata a target overlays onto the artifacts it renders.
 *
 * `defaults` applies to every artifact and `overrides` to one, keyed by slug, so a target states a rule once and
 * departs from it where it must. The two are separate fields rather than a reserved key beside the slugs, which is
 * what keeps an artifact from being unaddressable because its slug named the bucket.
 */
export const FrontmatterOverlaySchema = z
  .object({
    defaults: z.record(z.string(), z.unknown()).optional(),
    overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })
  .meta({ id: 'FrontmatterOverlay' });

/**
 * One rewrite applied to each line of a body, as a regular-expression source and the replacement it splices in.
 *
 * A source rather than a compiled expression, which keeps a declaration serializable. The engine owns the flags and
 * runs the rewrite a line at a time, so a pattern whose character classes admit a newline cannot run away from the
 * line it was written for. That it compiles is `assertRenderTargetsAreConsistent`'s question, a refinement here being
 * invisible to `z.toJSONSchema`.
 */
export const LineRewriteSchema = z
  .object({
    pattern: z.string(),
    replacement: z.string(),
  })
  .meta({ id: 'LineRewrite' });

/**
 * The line pair delimiting a span, each string the whole content of its marker line.
 *
 * Serves both a region's own fence and the template a contribution's markers render from, the two being one shape: a
 * region and a contribution are both a body between two marker lines, which is why one renderer writes either.
 */
export const MarkerPairSchema = z
  .object({
    open: z.string(),
    close: z.string(),
  })
  .meta({ id: 'MarkerPair' });

/**
 * Where one artifact kind lands in a target, and the name it deploys under.
 *
 * A kind the target declares no deployment for does not deploy there, which is the deployability question a token
 * naming an artifact has to answer before it can render.
 *
 * The two forms are the two ways a destination can hold a kind. `tree` gives each artifact its own file or directory,
 * laid out by the same vocabulary a source is read through. `region` routes every artifact of the kind into one file
 * the engine does not otherwise own, each behind its own markers inside a single fenced span.
 *
 * `nameTemplate` carries a `{slug}` placeholder the engine owns, so a kind that deploys under a derived name states
 * the derivation as data. Absent means the slug itself, the case every kind whose name is its slug leaves unwritten.
 * The region form carries none: an artifact routed into a host has no name of its own, and deploys at the host path.
 *
 * `contributionMarkers` is a template rather than a literal pair, its `{artifactId}` placeholder standing for the
 * contributor. The artifact id rather than the slug, because two kinds may aggregate into one host and only the id
 * carries the kind that tells their contributions apart.
 */
export const KindDeploymentSchema = z
  .discriminatedUnion('form', [
    z
      .object({
        form: z.literal('tree'),
        kindId: IdSchema,
        layout: KindLayoutSchema,
        nameTemplate: z.string().optional(),
      })
      .meta({ id: 'TreeKindDeployment' }),
    z
      .object({
        form: z.literal('region'),
        kindId: IdSchema,
        host: z.string().min(1),
        markers: MarkerPairSchema,
        contributionMarkers: MarkerPairSchema,
      })
      .meta({ id: 'RegionKindDeployment' }),
  ])
  .meta({ id: 'KindDeployment' });

/**
 * One transform stage a target runs, carrying the parameters that stage reads.
 *
 * A target declares which stages run, never their sequence: transclusion precedes everything that reads the segments it
 * produces, the frontmatter overlay follows every transform over the body, and the inlay stage follows that, so a
 * declared sequence could render wrongly while type-checking. `tokens` takes no parameters, reading the engine's token
 * kinds and the target's own mappings.
 *
 * `inlay` carries its own `syntax` rather than reading the transclusion stage's, a target being free to declare either
 * without the other. Its two marker fields are templates, as a region deployment's are: `markers` stands `{inlayName}`
 * and fences a whole filled inlay, while `contributionMarkers` stands `{artifactId}` and delimits one bound artifact's
 * body within it. `reshape` is what makes a bound body sit level with its host, and it is declared rather than
 * compiled in, so demoting a Markdown heading is data a consumer writes and no content format enters the engine.
 */
export const RenderStageSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('transclusion'), syntax: DirectiveSyntaxSchema }).meta({ id: 'TransclusionStage' }),
    z.object({ kind: z.literal('tokens') }).meta({ id: 'TokensStage' }),
    z.object({ kind: z.literal('links'), pattern: z.string() }).meta({ id: 'LinksStage' }),
    z.object({ kind: z.literal('frontmatter'), overlay: FrontmatterOverlaySchema }).meta({ id: 'FrontmatterStage' }),
    z
      .object({
        kind: z.literal('inlay'),
        syntax: DirectiveSyntaxSchema,
        markers: MarkerPairSchema,
        contributionMarkers: MarkerPairSchema,
        reshape: LineRewriteSchema.optional(),
      })
      .meta({ id: 'InlayStage' }),
  ])
  .meta({ id: 'RenderStage' });

/**
 * One destination as the transform pipeline reads it: the plan's target, plus where it deploys and what it runs.
 *
 * Extends the plan's target entry, so a declaration parses as a plan's `targets` entry and the two cannot drift.
 * Neither added field reaches the payload, on the reasoning that makes `TokenKind` engine input while the plan carries
 * only the descriptor: a consumer reading a plan needs to resolve a target's identity, not to re-run its pipeline.
 *
 * The `links` pattern holds a regular-expression source rather than a compiled expression, which keeps a declaration
 * serializable. The engine owns the flags and the splice, so the pattern states the grammar and nothing else. That it
 * compiles and carries exactly one capture group, and that no stage kind is declared twice, is checked in
 * `assertRenderTargetsAreConsistent`: a refinement here would be invisible to `z.toJSONSchema`.
 *
 * `ownedItems` is target-level content rather than a deployment, no artifact kind routing there, which is why it sits
 * beside `deployments` rather than inside it. It is optional because a target owning items inside another tool's
 * structured config is the exception, and absent says the same thing an empty list would.
 */
export const RenderTargetSchema = TargetEntrySchema.extend({
  deployments: z.array(KindDeploymentSchema),
  ownedItems: z.array(OwnedItemsDeclarationSchema).optional(),
  stages: z.array(RenderStageSchema),
}).meta({ id: 'RenderTarget' });

export type DirectiveSyntax = z.infer<typeof DirectiveSyntaxSchema>;
export type FrontmatterOverlay = z.infer<typeof FrontmatterOverlaySchema>;
export type InlayStage = Extract<RenderStage, { kind: 'inlay' }>;
export type KindDeployment = z.infer<typeof KindDeploymentSchema>;
export type LineRewrite = z.infer<typeof LineRewriteSchema>;
export type MarkerPair = z.infer<typeof MarkerPairSchema>;
export type RegionKindDeployment = Extract<KindDeployment, { form: 'region' }>;
export type RenderStage = z.infer<typeof RenderStageSchema>;
export type RenderTarget = z.infer<typeof RenderTargetSchema>;
export type TreeKindDeployment = Extract<KindDeployment, { form: 'tree' }>;
