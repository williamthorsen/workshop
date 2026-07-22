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
 * One kit's drift verdict.
 *
 * `expected` and `actual` are the manifest's hash and the on-disk hash; both are present only on a
 * `drift` verdict, since no other status has two hashes to compare.
 */
export const VerifyKitEntrySchema = z
  .object({
    name: z.string(),
    status: DriftStatusSchema,
    expected: z.string().optional(),
    actual: z.string().optional(),
  })
  .meta({ id: 'VerifyKitEntry' });

/**
 * Top-level shape of `rdy verify --json`.
 *
 * `passed` is true when every kit is `ok` or `unverified`, agreeing with exit code 0. An unreadable
 * manifest produces the error envelope instead of this payload.
 */
export const VerifyOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    passed: z.boolean(),
    kits: z.array(VerifyKitEntrySchema),
  })
  .meta({ id: 'VerifyOutput' });

export type JsonDriftStatus = z.infer<typeof DriftStatusSchema>;
export type JsonVerifyKitEntry = z.infer<typeof VerifyKitEntrySchema>;
export type JsonVerifyOutput = z.infer<typeof VerifyOutputSchema>;
