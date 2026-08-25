/**
 * Selection: which artifacts a config tier takes, and which it drops.
 *
 * Part of the authored config contract, under the normalizing and idempotence rules `config-schemas.ts` states.
 */

import { z } from 'zod';

import { compareStrings } from '../portable/compareStrings.ts';
import { IdSchema } from './scalar-schemas.ts';

/**
 * One `use` or `drop` entry: an artifact named by slug, or everything a source contains.
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

export type KindSelection = z.infer<typeof KindSelectionSchema>;
export type Selector = z.infer<typeof SelectorSchema>;
