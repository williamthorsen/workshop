import type { TempTree } from '@williamthorsen/toolbelt.testing/candidate';

import { ManifestSchema, type RdyManifest } from '../../manifest/manifestSchema.ts';

/** Reads and validates the manifest at `relativePath` in the tree. */
export function readTreeManifest(tree: TempTree, relativePath = '.readyup/manifest.json'): RdyManifest {
  return ManifestSchema.parse(tree.readJson(relativePath));
}
