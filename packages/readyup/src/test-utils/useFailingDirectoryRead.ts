import path from 'node:path';

import type { Mock } from 'vitest';
import { vi } from 'vitest';

const { readdirSync: readdirSyncActual } = await vi.importActual<typeof import('node:fs')>('node:fs');

/** Control over which directory reads a suite's mocked `readdirSync` fails. */
export interface FailingDirectoryRead {
  /** Fails the directory at a root-relative path, letting every other read through to the filesystem. */
  failReadOf: (relativePath: string, code: string) => void;
  /** Points the mock back at the real reader, failing nothing. */
  passAllReads: () => void;
}

/**
 * Binds a suite's mocked `readdirSync` to a directory tree.
 *
 * The mock is a parameter because `vi.mock` hoists per file, so each suite owns its own. `resolveRoot` is
 * a thunk because a temporary directory is built in a hook, after this call has already run.
 */
export function useFailingDirectoryRead(mock: Mock, resolveRoot: () => string): FailingDirectoryRead {
  return {
    failReadOf: (relativePath, code) => {
      const failingDir = path.join(resolveRoot(), relativePath);
      mock.mockImplementation((...args: Parameters<typeof readdirSyncActual>) => {
        if (args[0] === failingDir) throw Object.assign(new Error(`read failed: ${code}`), { code });
        return readdirSyncActual(...args);
      });
    },

    passAllReads: () => {
      mock.mockImplementation(readdirSyncActual);
    },
  };
}
