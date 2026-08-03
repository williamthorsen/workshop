import { hashUtf8 } from '../../portable/hash-content.ts';
import type { PartialEntry } from '../../schemas/graph-schemas.ts';

/** Builds the partials the representative sample's files draw shared content from. */
export function buildPartials(): Array<PartialEntry> {
  return [
    {
      id: 'team:_data/shared.md',
      sourceId: 'team',
      path: '_data/shared.md',
      hash: hashUtf8('team/_data/shared.md'),
    },
  ];
}
