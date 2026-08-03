import type { Id, KindId } from '../schemas/scalar-schemas.ts';

/**
 * The id identifying one artifact, composed from its kind and slug.
 *
 * A catalog entry and the plan artifact describing the same artifact compose their id the same way, which is what lets
 * a plan entry address its catalog entry. The result is opaque to a reader: a slug carrying the separator makes
 * splitting it back apart wrong, so a consumer needing the parts reads `kindId` and `slug` instead.
 */
export function composeArtifactId(kindId: KindId, slug: string): Id {
  return `${kindId}:${slug}`;
}
