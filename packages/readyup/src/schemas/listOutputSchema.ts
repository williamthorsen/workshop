import { z } from 'zod';

/**
 * Version of the `list` payload.
 *
 * Bumped when a field is removed, renamed, or re-typed -- never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/** Whether a listed kit is TypeScript source awaiting compilation or a compiled bundle. */
export const KitKindSchema = z.enum(['compiled', 'internal']).meta({ id: 'KitKind' });

/**
 * The installed package a listed kit was published by.
 *
 * Present only for a kit reached through a package source. Such a kit keeps `kind: 'compiled'`, because
 * that is what it is -- a compiled bundle -- and only its provenance is new. Recording provenance here
 * rather than as a third `kind` also keeps the payload additive: widening a closed set would bump
 * `schemaVersion`, while an optional field leaves a `v1` validator accepting these rows.
 *
 * `configured` reports whether the readyup config names the package, which is what decides whether
 * `rdy run --packages` would reach the kit. Under a repo-wide sweep the config is the one belonging to
 * the row's own `project`, so the same package reports differently across workspaces. It is absent only
 * from a payload written before the field existed, never as a way of saying `false`.
 */
export const ListKitOriginSchema = z
  .object({
    package: z.string(),
    version: z.string().optional(),
    configured: z.boolean().optional(),
  })
  .meta({ id: 'ListKitOrigin' });

/**
 * One kit row.
 *
 * Every field but `name` and `kind` comes from the manifest, so a kit enumerated from the filesystem
 * without one has only those two plus `path`. `checklists` is read from the manifest rather than
 * from the kit itself: listing kits never executes kit code.
 */
export const ListKitEntrySchema = z
  .object({
    name: z.string(),
    kind: KitKindSchema,
    /**
     * The project a kit was authored in, relative to the sweep root, present only for a repo-wide listing.
     *
     * Orthogonal to `origin` rather than an alternative to it: one names where a kit lives in this tree,
     * the other which installed package published it, and a kit can answer both.
     */
    project: z.string().optional(),
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
 * Rows are keyed by `name`, `kind`, `project`, and `origin.package` together, never by any subset. Under the
 * default configuration `internal.dir` and `compile.outDir` both resolve to `.readyup/kits`, so a
 * compiled source appears twice: once as `internal`, which `rdy run --jit <name>` runs, and once as
 * `compiled`, which `rdy run <name>` runs. A package's kit is `compiled` as well, so `name` and `kind`
 * alone collide between a project's own kit and a package's kit of the same name, and between two
 * packages publishing that name. A repo-wide listing adds a third collision, since two projects may each
 * hold a `default` kit, and two workspaces may each depend on the same publisher. Every such row is
 * meaningful, and a consumer indexing on less than the full key silently drops one of them.
 *
 * Every row is a kit some invocation would execute, which is the invariant a consumer iterating `kits`
 * relies on. A kit an unconfigured package publishes satisfies it: `rdy run --packages` will not reach it,
 * but `rdy run --from npm:<package>` will, and `origin.configured` is what tells the two apart.
 *
 * `availablePackages` names installed dependencies that publish kits but are absent from the config, so
 * they are candidates to add rather than kits. It accompanies the owner listing, which names them without
 * their kits; every `--packages` listing reports those kits as rows and emits no candidate list.
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
