import { type Mock, vi } from 'vitest';

import type { HumanRunDependencies } from '../runHumanMode.ts';
import type { JsonRunDependencies } from '../runJsonMode.ts';

type RunDependencies = HumanRunDependencies & JsonRunDependencies;

/**
 * Returns a fresh fake for every collaborator of either run mode, each preset to report nothing and to run without
 * touching the filesystem.
 *
 * `loadKit` and `runRdy` have no preset, so that a case that does not set them fails rather than running a kit that
 * it did not describe.
 */
export function createRunFakes(): RunFakes {
  return {
    formatCombinedSummary: vi.fn<RunDependencies['formatCombinedSummary']>().mockReturnValue('combined summary'),
    formatJsonReport: vi.fn<RunDependencies['formatJsonReport']>().mockReturnValue('{"worstSeverity":null}'),
    listKitStalenessWarnings: vi.fn<RunDependencies['listKitStalenessWarnings']>().mockReturnValue([]),
    listUnmarkedGeneratedSourceWarnings: vi
      .fn<RunDependencies['listUnmarkedGeneratedSourceWarnings']>()
      .mockResolvedValue([]),
    listUnusedPragmaWarnings: vi.fn<RunDependencies['listUnusedPragmaWarnings']>().mockReturnValue([]),
    loadKit: vi.fn<RunDependencies['loadKit']>(),
    readManifestTracking: vi
      .fn<RunDependencies['readManifestTracking']>()
      .mockReturnValue({ tracking: undefined, warnings: [] }),
    reportRdy: vi
      .fn<RunDependencies['reportRdy']>()
      .mockReturnValue({ body: 'report output', hasVisibleResults: true }),
    runRdy: vi.fn<RunDependencies['runRdy']>(),
  };
}

export type RunFakes = { [Name in keyof RunDependencies]: Mock<RunDependencies[Name]> };
