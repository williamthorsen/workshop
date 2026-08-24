import { realpathSync } from 'node:fs';
import process from 'node:process';

import { discoverWorkspacesAt, type Workspace } from '../check-utils/workspaces.ts';

/**
 * Locates the root directory of the workspace publishing `packageName`, or `undefined` when no workspace does.
 *
 * The fallback behind `resolvePackageRoot`, for a project whose own workspaces publish kits: A monorepo
 * declares no dependency on them at its root, so nothing links them into `node_modules` and the upward walk
 * does not find them. A workspace matches by the `name` its manifest declares, `private: true` included,
 * because `private` prevents publication to a registry and has no bearing on discovery inside the repo.
 *
 * Returns the real path, so the result matches what `resolvePackageRoot` returns for a workspace that is
 * linked into `node_modules`.
 */
export function resolveWorkspaceRoot(packageName: string, fromDir: string = process.cwd()): string | undefined {
  const workspaces = discoverWorkspacesOrNone(fromDir);
  const match = workspaces.find((workspace) => workspace.name === packageName);
  if (match === undefined) return undefined;

  return realpathSync(match.absolutePath);
}

// region | Helpers

/**
 * Discovers the workspaces of the project at `fromDir`, returning an empty list where discovery fails.
 *
 * Discovery throws for a project with no root manifest and for workspace globs readyup cannot expand. In
 * both cases no workspace can match the requested name, and propagating the error would replace the
 * caller's actionable "configured package was not found" with a diagnostic about the repository's layout.
 */
function discoverWorkspacesOrNone(fromDir: string): Workspace[] {
  try {
    return discoverWorkspacesAt(fromDir);
  } catch {
    return [];
  }
}

// endregion | Helpers
