import path from 'node:path';

import type { Mock } from 'vitest';
import { vi } from 'vitest';

const { readdirSync: readdirSyncActual } = await vi.importActual<typeof import('node:fs')>('node:fs');

/** Control over which directory reads a suite's mocked `readdirSync` fails. */
export interface FailingDirectoryRead {
  /** Fails the directory at a root-relative path, letting every other read through to the filesystem. */
  failReadOf: (relativePath: string, code: string) => void;
}

/**
 * Binds a suite's mocked `readdirSync` to a directory tree, failing nothing until asked.
 *
 * The mock is a parameter because `vi.mock` hoists per file, so each suite owns its own. Binding points the
 * mock at the real reader, so a suite that binds once per test starts each test from a reader that fails
 * nothing.
 */
export function useFailingDirectoryRead(mock: Mock, root: string): FailingDirectoryRead {
  mock.mockImplementation(readdirSyncActual);

  return {
    failReadOf: (relativePath, code) => {
      const failingDir = path.join(root, relativePath);
      mock.mockImplementation((...args: Parameters<typeof readdirSyncActual>) => {
        if (args[0] === failingDir) throw Object.assign(new Error(`read failed: ${code}`), { code });
        return readdirSyncActual(...args);
      });
    },
  };
}
