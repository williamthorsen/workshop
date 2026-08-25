/** Graph: artifacts, partials, and the edges between them. */

import { z } from 'zod';

import { ArtifactResolutionSchema } from './artifact-resolution-schemas.ts';
import { HashSchema, IdSchema } from './scalar-schemas.ts';

/**
 * How one dependency edge came to exist.
 *
 * `declared` is an edge written in an artifact's own frontmatter. `member` and `enumerated` are the two ways an
 * aggregate reaches its members: named explicitly, or drawn from a source's catalog. `injected` is an edge from a
 * frontmatter list that names artifacts of another kind. `token` is an edge contributed by an invocation token in a
 * body, which is the only origin that can arrive through a transcluded partial.
 */
export const EdgeOriginSchema = z
  .enum(['declared', 'enumerated', 'injected', 'member', 'token'])
  .meta({ id: 'EdgeOrigin' });

/**
 * One outgoing dependency edge.
 *
 * `partialId` names the partial a token was read from, and is present only for a `token` edge whose token reached the
 * artifact through transclusion. An edge whose token sits in the artifact's own body has no partial.
 */
export const DependencyEdgeSchema = z
  .object({
    to: IdSchema,
    via: EdgeOriginSchema,
    partialId: IdSchema.optional(),
  })
  .meta({ id: 'DependencyEdge' });

/**
 * How an artifact entered the closure as a root.
 *
 * `declaration` is a tier naming the artifact itself. `source-catalog` is a tier taking everything one source contains,
 * which names no artifact and so cannot say which one it meant. `binding` is a tier naming the artifact as the filler
 * of an inlay, which is a root rather than an edge: an edge would have to run from the artifact declaring the inlay,
 * and finding those means reading bodies for a directive whose syntax lives on a target, while the edge graph is
 * target-independent by construction.
 */
export const SeedOriginSchema = z.enum(['binding', 'declaration', 'source-catalog']).meta({ id: 'SeedOrigin' });

/**
 * One reason an artifact is a closure root, with the config tier that decided it.
 *
 * An artifact seeded by several tiers has one record each, which is what lets a consumer tell a project-level opt-in
 * from an inherited one. An artifact reached only as a dependency has none.
 */
export const SeedSchema = z
  .object({
    via: SeedOriginSchema,
    tierId: IdSchema,
  })
  .meta({ id: 'Seed' });

/**
 * An artifact the plan deploys or traverses.
 *
 * `status` describes this artifact's own resolved and rendered content. It is not a roll-up over the artifact's files:
 * several artifacts can share one aggregated output file, where a change to any of them moves the file.
 */
export const PresentArtifactSchema = z
  .object({
    id: IdSchema,
    kindId: IdSchema,
    slug: z.string(),
    status: z.enum(['added', 'changed', 'unchanged']),
    seededBy: z.array(SeedSchema),
    dependsOn: z.array(DependencyEdgeSchema),
    resolution: ArtifactResolutionSchema,
  })
  .meta({ id: 'PresentArtifact' });

/**
 * An artifact deployed previously and no longer part of the closure.
 *
 * Removal follows from the artifact no longer being declared, so it usually still resolves from a source and still
 * has the edges it had: both fields are populated when they are knowable, and absent when a dropped source leaves
 * the artifact unresolvable. It is seeded by nothing, so it has no `seededBy`.
 */
export const RemovedArtifactSchema = z
  .object({
    id: IdSchema,
    kindId: IdSchema,
    slug: z.string(),
    status: z.literal('removed'),
    dependsOn: z.array(DependencyEdgeSchema).optional(),
    resolution: ArtifactResolutionSchema.optional(),
  })
  .meta({ id: 'RemovedArtifact' });

/** One artifact's entry, told apart by its `status`. */
export const ArtifactEntrySchema = z
  .discriminatedUnion('status', [PresentArtifactSchema, RemovedArtifactSchema])
  .meta({ id: 'ArtifactEntry' });

/**
 * One partial whose content is transcluded into artifact bodies.
 *
 * A partial is addressed by path within the source that contains it, so it neither shadows across sources nor deploys,
 * and it holds no diff status of its own.
 */
export const PartialEntrySchema = z
  .object({
    id: IdSchema,
    sourceId: IdSchema,
    path: z.string(),
    hash: HashSchema,
  })
  .meta({ id: 'PartialEntry' });

export type ArtifactEntry = z.infer<typeof ArtifactEntrySchema>;
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;
export type EdgeOrigin = z.infer<typeof EdgeOriginSchema>;
export type PartialEntry = z.infer<typeof PartialEntrySchema>;
export type PresentArtifact = z.infer<typeof PresentArtifactSchema>;
export type RemovedArtifact = z.infer<typeof RemovedArtifactSchema>;
export type Seed = z.infer<typeof SeedSchema>;
export type SeedOrigin = z.infer<typeof SeedOriginSchema>;
