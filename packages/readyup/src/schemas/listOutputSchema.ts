import { z } from 'zod';

/**
 * Version of the `list` payload.
 *
 * Bumped when a field is removed, renamed, or re-typed — never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/** Whether a listed kit is TypeScript source awaiting compilation or a compiled bundle. */
export const KitKindSchema = z.enum(['compiled', 'internal']).meta({ id: 'KitKind' });

/**
 * One kit row.
 *
 * Every field but `name` and `kind` comes from the manifest, so a kit enumerated from the filesystem
 * without one carries only those two plus `path`. `checklists` is read from the manifest rather than
 * from the kit itself: listing kits never executes kit code.
 */
export const ListKitEntrySchema = z
  .object({
    name: z.string(),
    kind: KitKindSchema,
    path: z.string().optional(),
    description: z.string().optional(),
    readyupVersion: z.string().optional(),
    checklists: z.array(z.string()).optional(),
  })
  .meta({ id: 'ListKitEntry' });

/**
 * Top-level shape of `rdy list --json`.
 *
 * Rows are keyed by `name` and `kind` together, never by `name` alone. Under the default
 * configuration `internal.dir` and `compile.outDir` both resolve to `.readyup/kits`, so a compiled
 * source appears twice: once as `internal`, which `rdy run --jit <name>` runs, and once as
 * `compiled`, which `rdy run <name>` runs. Both rows are meaningful, and a consumer indexing on
 * `name` alone silently drops one of them.
 */
export const ListOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    kits: z.array(ListKitEntrySchema),
  })
  .meta({ id: 'ListOutput' });

export type JsonKitKind = z.infer<typeof KitKindSchema>;
export type JsonListKitEntry = z.infer<typeof ListKitEntrySchema>;
export type JsonListOutput = z.infer<typeof ListOutputSchema>;
