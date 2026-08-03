import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';

/** Builds the kinds the representative sample's artifacts belong to. */
export function buildKinds(): Array<KindDescriptor> {
  return [
    { id: 'collection', label: 'Collection', emitsFiles: false },
    { id: 'rulebook', label: 'Rulebook', emitsFiles: true },
    { id: 'skill', label: 'Skill', emitsFiles: true },
    { id: 'subagent', label: 'Subagent', emitsFiles: true },
  ];
}
