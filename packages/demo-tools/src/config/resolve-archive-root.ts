import path from 'node:path';

import { type MachineConfigInput, readMachineConfig } from './read-machine-config.ts';

/** The outcome of resolving the archive root: the root, `undefined` when nothing sets one, or what is wrong. */
export type ArchiveRootResult = { ok: true; archiveRoot: string | undefined } | { ok: false; message: string };

/** The variable that sets the archive root, overriding the machine configuration. */
export const ARCHIVE_ROOT_VARIABLE = 'THOR_DEMO_ARCHIVE_ROOT';

/**
 * Resolves the archive root from `THOR_DEMO_ARCHIVE_ROOT`, then from `archive.root` in the machine configuration,
 * whose value expands like `aidemo.env`. Either must be an absolute path. A missing file sets nothing.
 */
export function resolveArchiveRoot(input: MachineConfigInput): ArchiveRootResult {
  const fromEnv = input.env[ARCHIVE_ROOT_VARIABLE];
  if (fromEnv !== undefined && fromEnv !== '') {
    if (!path.isAbsolute(fromEnv)) {
      return { ok: false, message: `${ARCHIVE_ROOT_VARIABLE} must be an absolute path, not "${fromEnv}"` };
    }
    return { ok: true, archiveRoot: fromEnv };
  }

  const config = readMachineConfig(input);
  if (!config.ok) return config;
  if (!config.archive.ok) return config.archive;

  return { ok: true, archiveRoot: config.archive.root };
}
