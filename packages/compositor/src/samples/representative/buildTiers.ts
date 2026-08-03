import type { TierDescriptor } from '../../schemas/descriptor-schemas.ts';

/** Builds the tiers the representative sample's artifacts are seeded from, in precedence order. */
export function buildTiers(): Array<TierDescriptor> {
  return [
    { id: 'user', label: 'User' },
    { id: 'project', label: 'Project' },
  ];
}
