import { z } from 'zod';

/** Schema for a `pickJson` path specifier list, mirroring the function's second argument. */
const JsonPathSpecSchema = z.array(z.union([z.string(), z.array(z.string())]));

/**
 * Schema for one file the compile read to produce a kit's bundle.
 *
 * `kind` decides what the hash covers. A `module` records the file's contents; an `inline` records the
 * projection `pickJson` substituted, so an edit to a field the kit did not pick is not staleness. Only
 * an inline record has `paths`, which is the specifier that produced the projection and so what a
 * reader needs to reproduce it.
 *
 * Paths are relative to the manifest directory, as `path` and `source` are.
 */
const ManifestInputSchema = z.discriminatedUnion('kind', [
  z.object({ hash: z.string(), kind: z.literal('inline'), path: z.string(), paths: JsonPathSpecSchema }),
  z.object({ hash: z.string(), kind: z.literal('module'), path: z.string(), paths: z.undefined().optional() }),
]);

/**
 * Schema for a single kit entry in the manifest.
 *
 * `checklists` records the names `rdy compile` found in the kit, so `rdy list` can report them
 * without importing and executing the compiled bundle. It is optional because a manifest written by
 * an older readyup has no such record; readers strip what they do not recognize, so the field's
 * arrival leaves `version` at 1.
 *
 * `sourceHash` and `targetHash` are the two ends of the compile: the hash of the `.ts` the kit was
 * built from and the hash of the `.js` it produced. Comparing each against the file on disk is what
 * separates a source edited without recompiling from a compiled bundle edited by hand.
 *
 * `inputs` records everything else the compile read, which is every module the bundle inlined past the
 * entry and every JSON file `pickJson` projected. It is optional on the same terms `checklists` is: an
 * entry written before the closure was recorded has none.
 *
 * `esbuildVersion` and `bundledDependencies` record the toolchain half of the compile: the esbuild
 * that produced the bundle, and each package the bundle inlined with the version its `package.json`
 * declares. A package inlined at two versions at once records both, sorted and comma-separated.
 * Neither field is covered by `inputs`, whose closure stops at `node_modules`; `rdy verify
 * --rebuild` reads both to name which versions changed when a rebuild mismatches. Each is
 * optional on the same terms `checklists` is, and `bundledDependencies` is additionally absent
 * when the kit bundles nothing, so `esbuildVersion` is the marker that an entry has the
 * record at all.
 */
const ManifestKitSchema = z.object({
  bundledDependencies: z.record(z.string(), z.string()).optional(),
  checklists: z.array(z.string()).optional(),
  description: z.string().optional(),
  esbuildVersion: z.string().optional(),
  inputs: z.array(ManifestInputSchema).optional(),
  name: z.string().min(1),
  path: z.string().optional(),
  readyupVersion: z.string().optional(),
  source: z.string().optional(),
  sourceHash: z.string().optional(),
  targetHash: z.string().optional(),
});

/** Schema for the readyup manifest file. */
export const ManifestSchema = z.object({
  version: z.literal(1),
  kits: z.array(ManifestKitSchema),
});

/** Typed manifest produced by parsing with `ManifestSchema`. */
export type RdyManifest = z.infer<typeof ManifestSchema>;

/** Typed record of one file a kit's compile read. */
export type RdyManifestInput = z.infer<typeof ManifestInputSchema>;

/** Typed manifest kit entry. */
export type RdyManifestKit = z.infer<typeof ManifestKitSchema>;
