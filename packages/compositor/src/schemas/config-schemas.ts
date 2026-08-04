/**
 * Config: the tiered declaration a consumer folds into sources and a selection.
 *
 * These schemas normalize as they parse -- a bare slug becomes an entry, an authored `path` becomes a source origin --
 * so they carry transforms and do not render to JSON Schema, unlike the plan and catalog contracts. Config is authored
 * input rather than an emitted payload, which is also why it carries no `schemaVersion`.
 *
 * Parsing is idempotent: every schema accepts its own output as well as the authored form, so a consumer holding a
 * normalized config can mutate it and re-parse it for a What-if pass without denormalizing first.
 */

import { z } from 'zod';

import { IdSchema } from './scalar-schemas.ts';
import { SelectSchema } from './selection-schemas.ts';
import { SourceDeclarationSchema } from './source-declaration-schemas.ts';

/**
 * What one tier file carries.
 *
 * Strict, so a misspelled key fails rather than declaring nothing. A block that is absent, or whose value is `null`
 * because every entry under it is commented out, reads as the empty declaration it means.
 */
export const TierBodySchema = z.strictObject({
  shouldReset: z.boolean().default(false),
  sources: z.preprocess((value) => value ?? undefined, SourceDeclarationSchema.default({ use: [], drop: [] })),
  select: z.preprocess((value) => value ?? undefined, SelectSchema.default([])),
});

/**
 * One tier: what it declares, plus the identity and location a consumer gives it.
 *
 * `id`, `label`, and `baseDir` are not authored. A file does not know which tier it is -- that follows from where a
 * consumer looked for it -- which is what keeps any particular project layout out of this package.
 */
export const ConfigTierSchema = TierBodySchema.extend({
  id: IdSchema,
  label: z.string().min(1),
  baseDir: z.string().min(1),
});

/**
 * A whole tiered config, the value every flow downstream reads.
 *
 * `tiers` runs lowest precedence first, the order a fold applies them and the order a plan's `tiers` table carries. An
 * empty array is a config declaring nothing, which is the only sentinel that case needs. Ids are unique: a tier id is
 * the identity that leaves this package, naming the tier in every seed and diagnostic, so a repeat makes each of those
 * references ambiguous.
 */
export const CompositorConfigSchema = z.strictObject({
  tiers: z
    .array(ConfigTierSchema)
    .refine((tiers) => new Set(tiers.map(({ id }) => id)).size === tiers.length, {
      error: 'names a tier more than once',
    })
    .default([]),
});

export type CompositorConfig = z.infer<typeof CompositorConfigSchema>;
export type ConfigTier = z.infer<typeof ConfigTierSchema>;
export type TierBody = z.infer<typeof TierBodySchema>;
