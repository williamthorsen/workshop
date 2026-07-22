import { z } from 'zod';

/**
 * Schema for a single kit entry in the manifest.
 *
 * `checklists` records the names `rdy compile` found in the kit, so `rdy list` can report them
 * without importing and executing the compiled bundle. It is optional because a manifest written by
 * an older readyup has no such record; readers strip what they do not recognize, so the field's
 * arrival leaves `version` at 1.
 */
const ManifestKitSchema = z.object({
  checklists: z.array(z.string()).optional(),
  description: z.string().optional(),
  name: z.string().min(1),
  path: z.string().optional(),
  readyupVersion: z.string().optional(),
  source: z.string().optional(),
  targetHash: z.string().optional(),
});

/** Schema for the readyup manifest file. */
export const ManifestSchema = z.object({
  version: z.literal(1),
  kits: z.array(ManifestKitSchema),
});

/** Typed manifest produced by parsing with `ManifestSchema`. */
export type RdyManifest = z.infer<typeof ManifestSchema>;

/** Typed manifest kit entry. */
export type RdyManifestKit = z.infer<typeof ManifestKitSchema>;
