/** Render targets: the target as the transform pipeline reads it, with where it deploys and the stages it runs. */

import { z } from 'zod';

import { KindLayoutSchema } from './kind-layout-schemas.ts';
import { IdSchema } from './scalar-schemas.ts';
import { TargetEntrySchema } from './target-schemas.ts';

/**
 * The comment syntax a source writes its transclusion directives in.
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
 * Where one artifact kind lands in a target, and the name it deploys under.
 *
 * A kind the target declares no deployment for does not deploy there, which is the deployability question a token
 * naming an artifact has to answer before it can render.
 *
 * `nameTemplate` carries a `{slug}` placeholder the engine owns, so a kind that deploys under a derived name states
 * the derivation as data. Absent means the slug itself, the case every kind whose name is its slug leaves unwritten.
 */
export const KindDeploymentSchema = z
  .object({
    kindId: IdSchema,
    layout: KindLayoutSchema,
    nameTemplate: z.string().optional(),
  })
  .meta({ id: 'KindDeployment' });

/**
 * One transform stage a target runs, carrying the parameters that stage reads.
 *
 * A target declares which stages run, never their sequence: transclusion precedes everything that reads the segments it
 * produces, and the frontmatter overlay follows every transform over the body, so a declared sequence could render
 * wrongly while type-checking. `tokens` takes no parameters, reading the engine's token kinds and the target's own
 * mappings.
 */
export const RenderStageSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('transclusion'), syntax: DirectiveSyntaxSchema }).meta({ id: 'TransclusionStage' }),
    z.object({ kind: z.literal('tokens') }).meta({ id: 'TokensStage' }),
    z.object({ kind: z.literal('links'), pattern: z.string() }).meta({ id: 'LinksStage' }),
    z.object({ kind: z.literal('frontmatter'), overlay: FrontmatterOverlaySchema }).meta({ id: 'FrontmatterStage' }),
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
 */
export const RenderTargetSchema = TargetEntrySchema.extend({
  deployments: z.array(KindDeploymentSchema),
  stages: z.array(RenderStageSchema),
}).meta({ id: 'RenderTarget' });

export type DirectiveSyntax = z.infer<typeof DirectiveSyntaxSchema>;
export type FrontmatterOverlay = z.infer<typeof FrontmatterOverlaySchema>;
export type KindDeployment = z.infer<typeof KindDeploymentSchema>;
export type RenderStage = z.infer<typeof RenderStageSchema>;
export type RenderTarget = z.infer<typeof RenderTargetSchema>;
