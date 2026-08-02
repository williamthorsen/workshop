/** Shared building blocks: the scalar schemas every other table composes. */

import { z } from 'zod';

/**
 * A stable identifier for one entry in a plan's entity tables.
 *
 * Unique within a plan and stable across a replan whose inputs did not change. Opaque: a producer may compose one from
 * a kind and a slug, and a consumer that splits it on that composition breaks on a slug containing the separator.
 */
export const IdSchema = z.string().min(1).meta({ id: 'Id' });

/**
 * A content digest, compared only for equality.
 *
 * The algorithm belongs to the producer, and no consumer recomputes one: a digest answers "did this change" against
 * another digest from the same plan or from the plan before it.
 */
export const HashSchema = z.string().min(1).meta({ id: 'Hash' });

/** How one artifact or file stands relative to current target state. */
export const DiffStatusSchema = z.enum(['added', 'changed', 'removed', 'unchanged']).meta({ id: 'DiffStatus' });

export type DiffStatus = z.infer<typeof DiffStatusSchema>;
export type Hash = z.infer<typeof HashSchema>;
export type Id = z.infer<typeof IdSchema>;

/** Identifies an entry in a plan's `artifacts` table. */
export type ArtifactId = Id;

/** Identifies an entry in a plan's `kinds` table. */
export type KindId = Id;

/** Identifies an entry in a plan's `partials` table. */
export type PartialId = Id;

/** Identifies an entry in a plan's `sources` table. */
export type SourceId = Id;

/** Identifies an entry in a plan's `targets` table. */
export type TargetId = Id;
