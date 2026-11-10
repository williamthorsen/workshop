import { type Mock, vi } from 'vitest';

import type { VerifyDependencies } from '../verify-manifest.ts';
import { ABSENT_SRC_DIR, buildConfig } from './verify-harness.ts';

/**
 * Returns a fresh fake for every collaborator of a verify run, each preset to report nothing and to run without
 * touching the filesystem: the input and source checks report `unverified`, esbuild loads, and the config selects
 * sources from a directory that does not exist.
 *
 * `checkDrift` and `readManifest` have no preset, so that a case that does not set them fails rather than verifying a
 * manifest that it did not describe. `checkRebuild` has none either, since only `--rebuild` calls it.
 */
export function createVerifyFakes(): VerifyFakes {
  return {
    checkDrift: vi.fn<VerifyDependencies['checkDrift']>(),
    checkInputDrift: vi.fn<VerifyDependencies['checkInputDrift']>().mockReturnValue({ kind: 'unverified' }),
    checkRebuild: vi.fn<VerifyDependencies['checkRebuild']>(),
    checkSourceDrift: vi.fn<VerifyDependencies['checkSourceDrift']>().mockReturnValue({ kind: 'unverified' }),
    loadConfig: vi.fn<VerifyDependencies['loadConfig']>().mockResolvedValue(buildConfig(ABSENT_SRC_DIR)),
    loadEsbuild: vi.fn<VerifyDependencies['loadEsbuild']>().mockResolvedValue({}),
    readManifest: vi.fn<VerifyDependencies['readManifest']>(),
  };
}

export type VerifyFakes = { [Name in keyof VerifyDependencies]: Mock<VerifyDependencies[Name]> };
