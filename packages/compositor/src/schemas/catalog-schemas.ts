/** Catalog: every artifact the sources carry, and which source won each one. */

import { z } from 'zod';

import { ArtifactResolutionSchema } from './artifact-resolution-schemas.ts';
import { KindDescriptorSchema, SourceEntrySchema } from './descriptor-schemas.ts';
import { KindLayoutSchema } from './kind-layout-schemas.ts';
import { IdSchema } from './scalar-schemas.ts';

/**
 * Version of the catalog payload.
 *
 * Bumped when a field is removed, renamed, or re-typed, never when an optional field is added. Independent of the plan's
 * version: the two contracts share a resolution sub-shape but evolve on their own schedules.
 */
export const CATALOG_SCHEMA_VERSION = 1;

/**
 * One artifact kind as resolution needs it: the plan's descriptor, plus where a source keeps artifacts of that kind.
 *
 * Extends the plan's descriptor, so a catalog's `kinds` entry parses as a plan's and the two cannot drift. The layout
 * rides along because a consumer rendering a source's tree has no other way to learn it. `layout.root` is relative to a
 * source's own directory, so one declaration locates the kind in every source.
 */
export const ResolveKindSchema = KindDescriptorSchema.extend({ layout: KindLayoutSchema }).meta({ id: 'ResolveKind' });

/**
 * One source resolution reads, with the directory it resolved to.
 *
 * `origin.location` stays what the consumer declared, a path or a package name, and `dir` is where that landed on disk.
 * A reader shows the former; the engine reads the latter.
 */
export const SourceSpecSchema = SourceEntrySchema.extend({ dir: z.string() }).meta({ id: 'SourceSpec' });

/**
 * One artifact some source carries, and how precedence settled it.
 *
 * `id` composes `kindId` and `slug`, matching the id a plan gives the same artifact, so a plan entry addresses its
 * catalog entry.
 */
export const CatalogEntrySchema = z
  .object({
    id: IdSchema,
    kindId: IdSchema,
    slug: z.string(),
    resolution: ArtifactResolutionSchema,
  })
  .meta({ id: 'CatalogEntry' });

/**
 * Every artifact the declared sources carry, each with the source that won it and the sources that lost.
 *
 * This is the whole of what resolution answers: what exists, not what a consumer selected. Selection reads a catalog
 * rather than re-walking the sources, which is what lets a-la-carte opt-in offer a list to pick from and lets a
 * "take everything from this source" declaration be a query rather than a second filesystem pass.
 *
 * `sources` runs in precedence order, the only encoding of precedence, and `entries` runs lexicographically by id, so
 * two catalogs of the same shape diff cleanly.
 */
export const CatalogSchema = z
  .object({
    schemaVersion: z.int().min(1),
    kinds: z.array(ResolveKindSchema),
    sources: z.array(SourceSpecSchema),
    entries: z.array(CatalogEntrySchema),
  })
  .meta({ id: 'Catalog' });

export type Catalog = z.infer<typeof CatalogSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type ResolveKind = z.infer<typeof ResolveKindSchema>;
export type SourceSpec = z.infer<typeof SourceSpecSchema>;
