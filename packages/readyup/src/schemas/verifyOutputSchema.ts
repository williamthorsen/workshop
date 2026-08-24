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
 * Outcome of reading one kit's recorded input closure back off disk.
 *
 * A vocabulary of its own rather than a widening of any above, for the reason `SourceStatus`
 * records. One axis carries every kind of input, with `inputFailures` naming which inputs failed
 * and why, so a consumer branches on the cause rather than on a status per kind of input.
 */
export const InputsStatusSchema = z.enum(['ok', 'stale', 'unverified']).meta({ id: 'InputsStatus' });

/**
 * One recorded input that no longer matches what the compile read.
 *
 * `path` is the file as the manifest records it, relative to the manifest directory, and `kind`
 * separates a module the bundle inlined from a JSON projection `pickJson` substituted.
 *
 * Discriminated on `reason` so each cause carries exactly what it compared, as `ManifestInputSchema`
 * discriminates the record this reads back: `changed` carries the hash pair, `missing` carries
 * neither, and `unprojectable` carries a diagnosis instead and is inline-only, since only a
 * projection can fail to be reproduced. A consumer generating types from this narrows by `reason`
 * rather than by hand over three fields that are independently optional.
 */
export const InputFailureSchema = z
  .discriminatedUnion('reason', [
    z.object({
      kind: z.enum(['inline', 'module']),
      path: z.string(),
      reason: z.literal('changed'),
      expected: z.string(),
      actual: z.string(),
    }),
    z.object({ kind: z.enum(['inline', 'module']), path: z.string(), reason: z.literal('missing') }),
    z.object({ kind: z.literal('inline'), path: z.string(), reason: z.literal('unprojectable'), detail: z.string() }),
  ])
  .meta({ id: 'InputFailure' });

/**
 * Outcome of recompiling one kit and comparing the result to the bundle on disk.
 *
 * A fourth vocabulary rather than a widening of any enum above, for the reason `SourceStatus`
 * already records: the verdicts answer different questions, and widening a closed enum breaks a
 * consumer that switches exhaustively over it.
 *
 * It has no `unverified`. The other axes admit one because a manifest with no recorded hash says
 * nothing about whether the kit changed; here there is no bookkeeping to be absent, only inputs the
 * check needs, and a kit exempted from an exactness check would make a passing run mean less than
 * it says. `missing` covers every such absence and fails.
 */
export const RebuildStatusSchema = z.enum(['failed', 'mismatch', 'missing', 'ok']).meta({ id: 'RebuildStatus' });

/** The esbuild version a mismatched bundle was compiled with against the one the rebuild ran. */
export const RebuildEsbuildSchema = z
  .object({ recorded: z.string(), rebuilt: z.string() })
  .meta({ id: 'RebuildEsbuild' });

/**
 * One bundled package whose recorded version the rebuild does not reproduce.
 *
 * `recorded` is the version the compile bundled and `rebuilt` the one the rebuild bundled; a side is
 * absent where the package was not bundled then or now. A side carrying several comma-separated
 * versions is a package the bundle inlined at more than one version at once.
 */
export const RebuildDependencyChangeSchema = z
  .object({ name: z.string(), recorded: z.string().optional(), rebuilt: z.string().optional() })
  .meta({ id: 'RebuildDependencyChange' });

/**
 * One kit's verdicts.
 *
 * `expected` and `actual` are the manifest's hash and the on-disk hash of the compiled bundle; both
 * are present only on a `drift` verdict, since no other status has two hashes to compare.
 * `sourceExpected` and `sourceActual` are their counterparts for the source, present only on
 * `stale`. `inputFailures` is the same idea for the recorded input closure, present only on a
 * `stale` `inputsStatus` and carrying one entry per input rather than a pair of hashes, since a kit
 * can be stale in several inputs at once. `sourceStatus` and `inputsStatus` are optional so a
 * consumer pinned to this schema still validates a payload from a readyup that predates either.
 *
 * `rebuildStatus` and its fields appear only under `--rebuild`, so a run without the flag emits the
 * payload it always did. `rebuildExpected` is the hash of the recompiled bundle and `rebuildActual`
 * the hash of the bundle on disk, both present only on `mismatch`; `rebuildError` carries the
 * compile failure on `failed`. `rebuildCompiledWith` names the readyup a mismatched bundle was
 * built by, present only when it differs from the running one, which is what separates a mismatch
 * caused by a readyup upgrade from one caused by an edited bundle.
 *
 * `rebuildEsbuild` and `rebuildDependencyChanges` extend the same idea to the toolchain record: both
 * appear only on `mismatch`, and only for a kit whose manifest entry records an `esbuildVersion`.
 * `rebuildEsbuild` is present whenever that record exists, matching or not, so a consumer reads the
 * comparison rather than reconstructing it from the manifest; `rebuildDependencyChanges` is present
 * only when at least one bundled package's version moved.
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
    inputsStatus: InputsStatusSchema.optional(),
    inputFailures: z.array(InputFailureSchema).optional(),
    rebuildStatus: RebuildStatusSchema.optional(),
    rebuildExpected: z.string().optional(),
    rebuildActual: z.string().optional(),
    rebuildCompiledWith: z.string().optional(),
    rebuildEsbuild: RebuildEsbuildSchema.optional(),
    rebuildDependencyChanges: z.array(RebuildDependencyChangeSchema).optional(),
    rebuildError: z.string().optional(),
  })
  .meta({ id: 'VerifyKitEntry' });

/**
 * Top-level shape of `rdy verify --json`.
 *
 * `passed` is true when every one of every kit's verdicts is `ok` or `unverified`, agreeing with
 * exit code 0. An unreadable manifest produces the error envelope instead of this payload.
 */
export const VerifyOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    passed: z.boolean(),
    kits: z.array(VerifyKitEntrySchema),
  })
  .meta({ id: 'VerifyOutput' });

export type JsonDriftStatus = z.infer<typeof DriftStatusSchema>;
export type JsonInputFailure = z.infer<typeof InputFailureSchema>;
export type JsonInputsStatus = z.infer<typeof InputsStatusSchema>;
export type JsonRebuildDependencyChange = z.infer<typeof RebuildDependencyChangeSchema>;
export type JsonRebuildEsbuild = z.infer<typeof RebuildEsbuildSchema>;
export type JsonRebuildStatus = z.infer<typeof RebuildStatusSchema>;
export type JsonSourceStatus = z.infer<typeof SourceStatusSchema>;
export type JsonVerifyKitEntry = z.infer<typeof VerifyKitEntrySchema>;
export type JsonVerifyOutput = z.infer<typeof VerifyOutputSchema>;
