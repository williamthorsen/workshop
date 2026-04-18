import { z } from 'zod';

/** Schema for a single kit entry in the manifest. */
const ManifestKitSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1),
  path: z.string().optional(),
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
