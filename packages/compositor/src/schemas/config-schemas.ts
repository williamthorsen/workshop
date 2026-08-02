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

import { compareStrings } from '../portable/compareStrings.ts';
import { IdSchema } from './common.ts';
import { SourceOriginSchema } from './descriptor-schemas.ts';

/**
 * One `use` or `drop` entry: an artifact named by slug, or everything a source carries.
 *
 * A bare string is the artifact form, so the common case stays terse. The object forms are told apart by which key is
 * present rather than by a sentinel prefix, which would reserve a character out of the slug namespace. An entry naming
 * both is rejected rather than settled by precedence: the key each form does not own is typed `never`, so a mistake
 * fails the parse instead of being silently dropped by the strip that would otherwise swallow it.
 */
export const SelectorSchema = z.union([
  z
    .string()
    .min(1)
    .transform((artifact) => ({ artifact })),
  z.object({ artifact: z.string().min(1), source: z.never().optional() }).transform(({ artifact }) => ({ artifact })),
  z.object({ source: z.string().min(1), artifact: z.never().optional() }).transform(({ source }) => ({ source })),
]);

/**
 * One declared content source, in either the authored or the normalized spelling.
 *
 * `path` and `package` are the two authored spellings of the plan schema's source origins, and `origin` is what they
 * normalize to. A source declares exactly one of the three. The location stays as authored: resolving it against the
 * declaring tier is `resolveSources`' job, so a plan reports the path a consumer wrote rather than where it landed.
 */
export const DeclaredSourceSchema = z.union([
  z
    .object({
      name: z.string().min(1),
      path: z.string().min(1),
      package: z.never().optional(),
      origin: z.never().optional(),
    })
    .transform(({ name, path }) => ({ name, origin: { kind: 'directory' as const, location: path } })),
  z
    .object({
      name: z.string().min(1),
      package: z.string().min(1),
      path: z.never().optional(),
      origin: z.never().optional(),
    })
    .transform(({ name, package: location }) => ({ name, origin: { kind: 'package' as const, location } })),
  z
    .object({
      name: z.string().min(1),
      origin: SourceOriginSchema,
      path: z.never().optional(),
      package: z.never().optional(),
    })
    .transform(({ name, origin }) => ({ name, origin })),
]);

/**
 * One tier's source declarations: the sources it adds, and the inherited names it drops.
 *
 * `drop` names sources rather than carrying entries, because a name is the whole of what identifies one. Dropping is
 * what the port could do to a package and not to a source; unifying the two lists keeps the stronger semantics.
 */
export const SourceDeclarationSchema = z.strictObject({
  use: z.array(DeclaredSourceSchema).default([]),
  drop: z.array(z.string().min(1)).default([]),
});

/** One kind's selections within a tier. */
export const KindSelectionSchema = z.strictObject({
  kindId: IdSchema,
  use: z.array(SelectorSchema).default([]),
  drop: z.array(SelectorSchema).default([]),
});

/**
 * A tier's selections across every kind it speaks about, as a `kindId`-keyed mapping or as the normalized array.
 *
 * The array form is tried first, so an array input never reaches the record branch. Entries sort by `kindId`, which is
 * what keeps a config authored in two different orders digesting to one value.
 */
export const SelectSchema = z
  .union([
    z.array(KindSelectionSchema),
    z
      .record(
        IdSchema,
        z.preprocess(
          (value) => value ?? undefined,
          KindSelectionSchema.omit({ kindId: true }).default({ use: [], drop: [] }),
        ),
      )
      .transform((blocks) => Object.entries(blocks).map(([kindId, block]) => ({ kindId, ...block }))),
  ])
  .refine((blocks) => new Set(blocks.map(({ kindId }) => kindId)).size === blocks.length, {
    error: 'names a kind more than once',
  })
  .transform((blocks) => blocks.toSorted((left, right) => compareStrings(left.kindId, right.kindId)));

/**
 * What one tier file carries.
 *
 * Strict, so a misspelled key fails rather than declaring nothing. A block that is absent, or whose value is `null`
 * because every entry under it is commented out, reads as the empty declaration it means.
 */
export const TierBodySchema = z.strictObject({
  reset: z.boolean().default(false),
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
export type DeclaredSource = z.infer<typeof DeclaredSourceSchema>;
export type KindSelection = z.infer<typeof KindSelectionSchema>;
export type Selector = z.infer<typeof SelectorSchema>;
export type SourceDeclaration = z.infer<typeof SourceDeclarationSchema>;
export type TierBody = z.infer<typeof TierBodySchema>;
