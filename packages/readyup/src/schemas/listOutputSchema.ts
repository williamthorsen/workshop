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
 * The installed package a listed kit was published by.
 *
 * Present only for a kit reached through a package source. Such a kit keeps `kind: 'compiled'`, because
 * that is what it is — a compiled bundle — and only its provenance is new. Recording provenance here
 * rather than as a third `kind` also keeps the payload additive: widening a closed set would bump
 * `schemaVersion`, while an optional field leaves a `v1` validator accepting these rows.
 */
export const ListKitOriginSchema = z
  .object({
    package: z.string(),
    version: z.string().optional(),
  })
  .meta({ id: 'ListKitOrigin' });

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
    origin: ListKitOriginSchema.optional(),
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
 *
 * `availablePackages` names installed dependencies that publish kits but are absent from the config, so
 * they are candidates to add rather than kits that would run. They are kept out of `kits` for exactly
 * that reason: a consumer iterating `kits` must never be handed something no invocation would execute.
 */
export const ListOutputSchema = z
  .object({
    schemaVersion: z.int().min(1),
    kits: z.array(ListKitEntrySchema),
    availablePackages: z.array(z.string()).optional(),
  })
  .meta({ id: 'ListOutput' });

export type JsonKitKind = z.infer<typeof KitKindSchema>;
export type JsonListKitOrigin = z.infer<typeof ListKitOriginSchema>;
export type JsonListKitEntry = z.infer<typeof ListKitEntrySchema>;
export type JsonListOutput = z.infer<typeof ListOutputSchema>;
