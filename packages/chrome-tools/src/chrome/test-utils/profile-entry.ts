import type { ProfileFacts } from '../profiles.ts';
import type { ProfileEntry } from '../results.ts';

/** Builds a stopped profile `thrive` without a record, with the given fields and facts replacing the defaults. */
export function makeProfileEntry(
  overrides: Partial<Omit<ProfileEntry, 'facts'>> = {},
  facts: Partial<ProfileFacts> = {},
): ProfileEntry {
  return {
    facts: {
      branch: undefined,
      lastUsed: undefined,
      origin: undefined,
      repo: undefined,
      repoDir: undefined,
      stale: undefined,
      ...facts,
    },
    isHeadless: undefined,
    isRepoPresent: undefined,
    name: 'thrive',
    path: '/p/thrive',
    pid: undefined,
    port: undefined,
    state: 'stopped',
    ...overrides,
  };
}
