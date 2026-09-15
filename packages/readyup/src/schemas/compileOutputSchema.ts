import { z } from 'zod';

import { WarningSchema } from './common.ts';

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
 * the kit itself could not be bundled or validated, or that the bundle of a kit with no source could not be deleted.
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
 * A bundle deleted by a compile sweep because no source compiles to it and the manifest recorded it unedited.
 *
 * `path` is relative to the working directory. `project` is emitted under `--recursive` alone, as on a kit entry.
 */
export const CompileRemovedEntrySchema = z
  .object({
    name: z.string(),
    project: z.string().optional(),
    path: z.string(),
  })
  .meta({ id: 'CompileRemovedEntry' });

/**
 * Top-level shape of `rdy compile --json`.
 *
 * A sweep runs to completion, so every requested kit appears here whatever happened to the ones
 * before it. `passed` is `true` when every kit compiled and, under `--recursive`, every project passed,
 * agreeing with exit code 0. A kit whose source is gone and whose bundle was kept appears among `kits`
 * as `skipped` or `failed`, so it counts against `passed` as any other kit does.
 *
 * `projects` is emitted under `--recursive` alone, and lists every project that the sweep visited, so a
 * project that contributed no kit entry is still reported.
 *
 * `removed` lists the bundles that the sweep deleted, and is absent when it deleted none.
 *
 * `warnings` lists the advisories raised by the kits that compiled and by the bundles that nothing accounts for, and
 * is absent when none was raised. No warning affects `passed`.
 */
export const CompileOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    passed: z.boolean(),
    kits: z.array(CompileKitEntrySchema),
    projects: z.array(CompileProjectEntrySchema).optional(),
    removed: z.array(CompileRemovedEntrySchema).optional(),
    warnings: z.array(WarningSchema).optional(),
  })
  .meta({ id: 'CompileOutput' });

export type JsonCompileStatus = z.infer<typeof CompileStatusSchema>;
export type JsonCompileKitEntry = z.infer<typeof CompileKitEntrySchema>;
export type JsonCompileOutput = z.infer<typeof CompileOutputSchema>;
export type JsonCompileProjectEntry = z.infer<typeof CompileProjectEntrySchema>;
export type JsonCompileRemovedEntry = z.infer<typeof CompileRemovedEntrySchema>;
