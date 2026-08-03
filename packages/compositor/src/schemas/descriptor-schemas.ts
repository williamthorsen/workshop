/** Descriptors: the kinds, sources, and tiers a plan is computed over. */

import { z } from 'zod';

import { IdSchema } from './scalar-schemas.ts';

/**
 * One artifact kind the plan's artifacts are drawn from.
 *
 * Kinds are consumer data: the engine never names one, so a plan without this table leaves every `kindId` unresolvable
 * to anything a reader recognizes. `emitsFiles: false` marks a kind that takes part in the dependency graph without
 * producing output, which keeps an aggregate visible on the path explaining why its members are present.
 */
export const KindDescriptorSchema = z
  .object({
    id: IdSchema,
    label: z.string(),
    emitsFiles: z.boolean(),
  })
  .meta({ id: 'KindDescriptor' });

/** Where a source's content comes from. */
export const SourceOriginSchema = z
  .object({
    kind: z.enum(['directory', 'package']),
    location: z.string(),
  })
  .meta({ id: 'SourceOrigin' });

/**
 * One declared content source.
 *
 * The `sources` array is ordered highest precedence first, and that order is the only encoding of precedence.
 */
export const SourceEntrySchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    origin: SourceOriginSchema,
  })
  .meta({ id: 'SourceEntry' });

/**
 * One config tier a seed can be decided by.
 *
 * The `tiers` array runs lowest precedence first, the order a fold applies them in, so the last tier to speak wins. That
 * is deliberately the reverse of `sources`, where the first entry wins: a source's position encodes precedence directly,
 * and a tier's encodes application.
 */
export const TierDescriptorSchema = z
  .object({
    id: IdSchema,
    label: z.string(),
  })
  .meta({ id: 'TierDescriptor' });

export type KindDescriptor = z.infer<typeof KindDescriptorSchema>;
export type SourceEntry = z.infer<typeof SourceEntrySchema>;
export type SourceOrigin = z.infer<typeof SourceOriginSchema>;
export type TierDescriptor = z.infer<typeof TierDescriptorSchema>;
