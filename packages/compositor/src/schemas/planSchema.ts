import { z } from 'zod';

import { HashSchema, IdSchema } from './common.ts';
import { KindDescriptorSchema, SourceEntrySchema, TargetEntrySchema } from './descriptorSchemas.ts';
import { BlobSchema, FileEntrySchema } from './fileSchemas.ts';
import { ArtifactEntrySchema, PartialEntrySchema } from './graphSchemas.ts';

/**
 * Version of the plan payload.
 *
 * Bumped when a field is removed, renamed, or re-typed, never when an optional field is added. Objects in this schema
 * are open, which is what lets an added field reach a consumer pinned to an earlier version without breaking it.
 */
export const PLAN_SCHEMA_VERSION = 1;

/** One source's content digest, covering everything under it that could contribute to a plan. */
export const SourceDigestSchema = z.object({ sourceId: IdSchema, digest: HashSchema }).meta({ id: 'SourceDigest' });

/** One target's current-state digest. */
export const TargetDigestSchema = z.object({ targetId: IdSchema, digest: HashSchema }).meta({ id: 'TargetDigest' });

/**
 * The inputs a plan was computed from, so a consumer detects staleness without watching files.
 *
 * `targetState` is an input because some planned content is derived by reading the destination, which makes a target's
 * own contents part of what the plan depends on. `composite` answers "is this plan stale" in one comparison; the parts
 * beside it name what moved when the answer is yes.
 */
export const PlanFingerprintSchema = z
  .object({
    config: HashSchema,
    sources: z.array(SourceDigestSchema),
    targetState: z.array(TargetDigestSchema),
    composite: HashSchema,
  })
  .meta({ id: 'PlanFingerprint' });

/**
 * The complete result of planning: what the output looks like, how it differs from current state, and why each part of
 * it is there.
 *
 * Cross-references between tables are ids, because the provenance graph has diamonds and JSON holds no references. The
 * per-target directory tree follows from the paths in `files`.
 *
 * `contentAvailability` states up front whether `blobs` holds every body the plan references, so a consumer knows what
 * it is holding without discovering a miss part-way through rendering.
 *
 * The payload carries no timestamp: identical inputs produce an identical plan, and a clock-derived field would make
 * every plan differ from the one before it.
 */
export const PlanSchema = z
  .object({
    schemaVersion: z.int().min(1),
    engineVersion: z.string(),
    contentAvailability: z.enum(['complete', 'partial']),
    fingerprint: PlanFingerprintSchema,
    kinds: z.array(KindDescriptorSchema),
    sources: z.array(SourceEntrySchema),
    targets: z.array(TargetEntrySchema),
    artifacts: z.array(ArtifactEntrySchema),
    partials: z.array(PartialEntrySchema),
    files: z.array(FileEntrySchema),
    blobs: z.record(HashSchema, BlobSchema),
  })
  .meta({ id: 'Plan' });

export type Plan = z.infer<typeof PlanSchema>;
export type PlanFingerprint = z.infer<typeof PlanFingerprintSchema>;
export type SourceDigest = z.infer<typeof SourceDigestSchema>;
export type TargetDigest = z.infer<typeof TargetDigestSchema>;
