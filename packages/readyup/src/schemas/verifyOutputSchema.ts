import { z } from 'zod';

/**
 * Version of the `verify` payload.
 *
 * Bumped when a field is removed, renamed, or re-typed — never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/** Outcome of hashing one compiled kit against the hash the manifest recorded for it. */
export const DriftStatusSchema = z.enum(['drift', 'missing', 'ok', 'unverified']).meta({ id: 'DriftStatus' });

/**
 * Outcome of hashing one kit's TypeScript source against the hash the manifest recorded for it.
 *
 * A separate vocabulary from `DriftStatus` rather than a widening of it. The two verdicts answer
 * different questions -- has the bundle been edited, and has the source moved on since it was
 * built -- and a kit can carry a distinct answer to each. Widening the closed `DriftStatus` enum
 * would also break a consumer that exhaustively switches on it.
 */
export const SourceStatusSchema = z.enum(['missing', 'ok', 'stale', 'unverified']).meta({ id: 'SourceStatus' });

/**
 * One kit's verdicts.
 *
 * `expected` and `actual` are the manifest's hash and the on-disk hash of the compiled bundle; both
 * are present only on a `drift` verdict, since no other status has two hashes to compare.
 * `sourceExpected` and `sourceActual` are their counterparts for the source, present only on
 * `stale`. `sourceStatus` is optional so a consumer pinned to this schema still validates a payload
 * from the readyup that predates the source verdict.
 */
export const VerifyKitEntrySchema = z
  .object({
    name: z.string(),
    status: DriftStatusSchema,
    expected: z.string().optional(),
    actual: z.string().optional(),
    sourceStatus: SourceStatusSchema.optional(),
    sourceExpected: z.string().optional(),
    sourceActual: z.string().optional(),
  })
  .meta({ id: 'VerifyKitEntry' });

/**
 * Top-level shape of `rdy verify --json`.
 *
 * `passed` is true when both of every kit's verdicts are `ok` or `unverified`, agreeing with exit
 * code 0. An unreadable manifest produces the error envelope instead of this payload.
 */
export const VerifyOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    passed: z.boolean(),
    kits: z.array(VerifyKitEntrySchema),
  })
  .meta({ id: 'VerifyOutput' });

export type JsonDriftStatus = z.infer<typeof DriftStatusSchema>;
export type JsonSourceStatus = z.infer<typeof SourceStatusSchema>;
export type JsonVerifyKitEntry = z.infer<typeof VerifyKitEntrySchema>;
export type JsonVerifyOutput = z.infer<typeof VerifyOutputSchema>;
