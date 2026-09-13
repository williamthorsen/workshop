import { z } from 'zod';

/**
 * Version of the `compile` payload.
 *
 * Bumped when a field is removed, renamed, or re-typed -- never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/**
 * What became of one kit in a compile sweep.
 *
 * `skipped` means the compiled file had drifted from the manifest and was left alone; `failed` means
 * the kit itself could not be bundled or validated.
 */
export const CompileStatusSchema = z.enum(['compiled', 'failed', 'skipped']).meta({ id: 'CompileStatus' });

/**
 * One kit's compile outcome, with the reason only when there is a failure to explain.
 *
 * `project` is emitted under `--recursive` alone, naming the directory of the project that holds the kit,
 * relative to the directory from which the sweep descended; `'.'` is that directory itself.
 */
export const CompileKitEntrySchema = z
  .object({
    name: z.string(),
    project: z.string().optional(),
    status: CompileStatusSchema,
    error: z.string().optional(),
  })
  .meta({ id: 'CompileKitEntry' });

/**
 * One project's outcome in a recursive compile.
 *
 * `passed` is `true` when the project could be compiled and every kit in it compiled. `error` explains a
 * project that could not be compiled at all, which contributes no kit entries.
 */
export const CompileProjectEntrySchema = z
  .object({
    project: z.string(),
    passed: z.boolean(),
    error: z.string().optional(),
  })
  .meta({ id: 'CompileProjectEntry' });

/**
 * Top-level shape of `rdy compile --json`.
 *
 * A sweep runs to completion, so every requested kit appears here whatever happened to the ones
 * before it. `passed` is `true` when every kit compiled and, under `--recursive`, every project passed,
 * agreeing with exit code 0.
 *
 * `projects` is emitted under `--recursive` alone, and lists every project that the sweep visited, so a
 * project that contributed no kit entry is still reported.
 */
export const CompileOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    passed: z.boolean(),
    kits: z.array(CompileKitEntrySchema),
    projects: z.array(CompileProjectEntrySchema).optional(),
  })
  .meta({ id: 'CompileOutput' });

export type JsonCompileStatus = z.infer<typeof CompileStatusSchema>;
export type JsonCompileKitEntry = z.infer<typeof CompileKitEntrySchema>;
export type JsonCompileOutput = z.infer<typeof CompileOutputSchema>;
export type JsonCompileProjectEntry = z.infer<typeof CompileProjectEntrySchema>;
