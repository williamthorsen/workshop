import path from 'node:path';

import { type Mock, vi } from 'vitest';

const { readdirSync: readdirSyncActual } = await vi.importActual<typeof import('node:fs')>('node:fs');

/** Control over which directory reads a suite's mocked `readdirSync` fails. */
export interface FailingDirectoryRead {
  /** Fails the directory at a root-relative path as well as any failed before, letting other reads through. */
  failReadOf: (relativePath: string, code: string) => void;
}

/**
 * Binds a suite's mocked `readdirSync` to a directory tree, failing nothing until asked.
 *
 * The mock is a parameter because `vi.mock` hoists per file, so each suite owns its own. Because each binding
 * starts from an empty set of failures, a suite that binds once per test starts each test from a reader that fails
 * nothing.
 */
export function useFailingDirectoryRead(mock: Mock, root: string): FailingDirectoryRead {
  const failures = new Map<unknown, string>();
  mock.mockImplementation((...args: Parameters<typeof readdirSyncActual>) => {
    const code = failures.get(args[0]);
    if (code !== undefined) throw Object.assign(new Error(`read failed: ${code}`), { code });
    return readdirSyncActual(...args);
  });

  return {
    failReadOf: (relativePath, code) => {
      failures.set(path.join(root, relativePath), code);
    },
  };
}
