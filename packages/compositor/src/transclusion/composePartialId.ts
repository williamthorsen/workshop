import type { PartialId, SourceId } from '../schemas/scalar-schemas.ts';

/**
 * Composes the id identifying one partial from the source carrying it and its path within that source.
 *
 * A partial is addressed within one source, so two sources carrying the same path are two partials. The result is
 * opaque, as `composeArtifactId`'s is: a path carrying the separator makes splitting it back apart wrong, so a consumer
 * needing the parts reads `sourceId` and `path` instead.
 */
export function composePartialId(sourceId: SourceId, partialPath: string): PartialId {
  return `${sourceId}:${partialPath}`;
}
