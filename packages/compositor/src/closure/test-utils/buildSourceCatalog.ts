import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';

import { resolveCatalog } from '../../resolution/resolveCatalog.ts';
import type { Catalog, ResolveKind } from '../../schemas/catalog-schemas.ts';
import { SAMPLE_KINDS } from './sample-kinds.ts';

/** One source's content, as the files it contains relative to its own directory. */
export interface SourceContent {
  readonly id: string;
  readonly files: Record<string, string>;
}

/**
 * Writes each source's content to a temporary directory and resolves the result into a catalog.
 *
 * Building the catalog with the real resolver rather than by hand is what makes the entry paths real: the graph reads
 * an artifact at the path its catalog entry records, so a hand-written path would let that composition go untested.
 *
 * `sources` runs highest precedence first, as `resolveCatalog` takes it.
 */
export async function buildSourceCatalog(
  sources: ReadonlyArray<SourceContent>,
  kinds: ReadonlyArray<ResolveKind> = SAMPLE_KINDS,
): Promise<Catalog> {
  const specs = sources.map((source) => ({
    id: source.id,
    name: source.id,
    origin: { kind: 'directory' as const, location: `./${source.id}` },
    dir: disposeOnTestFinished(createTempTree(source.files, { prefix: `compositor-${source.id}-` })).dir,
  }));
  return resolveCatalog({ kinds, sources: specs });
}
