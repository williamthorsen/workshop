/** Targets: the destinations a plan renders for, with the name mappings their transforms read. */

import { z } from 'zod';

import { IdSchema } from './scalar-schemas.ts';

/** One canonical-name-to-rendered-name pair within a token kind's mapping. */
export const TokenMappingEntrySchema = z
  .object({
    from: z.string(),
    to: z.string(),
  })
  .meta({ id: 'TokenMappingEntry' });

/**
 * How one token kind's canonical names render for a target.
 *
 * Token kinds are declared as consumer data, so a tool-name mapping and any other name-rewriting vocabulary share this
 * one shape. `sigil` prefixes whatever the kind resolved to, which is how one target addresses an artifact as `/name`
 * and another as `!name`; a kind resolving through `entries` alone carries none.
 */
export const TokenMappingSchema = z
  .object({
    kindId: IdSchema,
    entries: z.array(TokenMappingEntrySchema),
    sigil: z.string().optional(),
  })
  .meta({ id: 'TokenMapping' });

/**
 * One destination the plan renders content for, with the metadata a consumer can query.
 *
 * `tokenMappings` is an array of pairs, so it has a sort key the determinism guarantee can name. It is also the whole
 * of a target's substitution vocabulary: a named value a body interpolates is a mapping token kind, since a
 * name-to-value table is inert without a pattern that recognizes a reference to it.
 */
export const TargetEntrySchema = z
  .object({
    id: IdSchema,
    label: z.string(),
    root: z.string(),
    tokenMappings: z.array(TokenMappingSchema),
  })
  .meta({ id: 'TargetEntry' });

export type TargetEntry = z.infer<typeof TargetEntrySchema>;
export type TokenMapping = z.infer<typeof TokenMappingSchema>;
export type TokenMappingEntry = z.infer<typeof TokenMappingEntrySchema>;
