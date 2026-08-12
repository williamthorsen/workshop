import type { RdyKit } from '../../kits/types.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';

/** Builds a two-checklist kit named `deploy` and `infra`. */
export function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'deploy', checks: [{ name: 'a', check: () => true }] },
      { name: 'infra', checks: [{ name: 'b', check: () => true }] },
    ],
    ...overrides,
  };
}

/** Builds the one-entry list a run of the local `default` kit resolves to. */
export function singleKitEntry(checklists: string[] = []): ResolvedKitEntry[] {
  return [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists }];
}
