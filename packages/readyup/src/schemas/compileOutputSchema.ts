import { z } from 'zod';

/**
 * Version of the `compile` payload.
 *
 * Bumped when a field is removed, renamed, or re-typed — never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/**
 * What became of one kit in a compile sweep.
 *
 * `skipped` means the compiled file had drifted from the manifest and was left alone; `failed` means
 * the kit itself could not be bundled or validated.
 */
export const CompileStatusSchema = z.enum(['compiled', 'failed', 'skipped']).meta({ id: 'CompileStatus' });

/** One kit's compile outcome, carrying the reason only when there is a failure to explain. */
export const CompileKitEntrySchema = z
  .object({
    name: z.string(),
    status: CompileStatusSchema,
    error: z.string().optional(),
  })
  .meta({ id: 'CompileKitEntry' });

/**
 * Top-level shape of `rdy compile --json`.
 *
 * A sweep runs to completion, so every requested kit appears here whatever happened to the ones
 * before it. `passed` is true when every kit compiled, agreeing with exit code 0.
 */
export const CompileOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    passed: z.boolean(),
    kits: z.array(CompileKitEntrySchema),
  })
  .meta({ id: 'CompileOutput' });

export type JsonCompileStatus = z.infer<typeof CompileStatusSchema>;
export type JsonCompileKitEntry = z.infer<typeof CompileKitEntrySchema>;
export type JsonCompileOutput = z.infer<typeof CompileOutputSchema>;
