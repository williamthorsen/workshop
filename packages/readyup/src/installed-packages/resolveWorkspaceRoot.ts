import { realpathSync } from 'node:fs';
import process from 'node:process';

import { discoverWorkspacesAt, type Workspace } from '../check-utils/workspaces.ts';

/**
 * Locates the root directory of the workspace publishing `packageName`, or `undefined` when no workspace does.
 *
 * The second answer behind `resolvePackageRoot`, for a project whose own workspaces publish kits: a monorepo
 * declares no dependency on them at its root, so nothing links them into `node_modules` and the walk misses.
 * A workspace matches by the `name` its manifest declares, `private: true` included, since privacy governs
 * publication to a registry rather than discovery inside the repo.
 *
 * Answers with the real path, matching what the `node_modules` walk reports for a workspace linked into it.
 */
export function resolveWorkspaceRoot(packageName: string, fromDir: string = process.cwd()): string | undefined {
  const workspaces = discoverWorkspacesOrNone(fromDir);
  const match = workspaces.find((workspace) => workspace.name === packageName);
  if (match === undefined) return undefined;

  return realpathSync(match.absolutePath);
}

// region | Helpers

/**
 * Discovers the workspaces of the project at `fromDir`, answering with none where discovery cannot.
 *
 * Discovery throws for a project with no root manifest and for workspace globs readyup cannot expand. Both
 * mean the same thing here -- no workspace answers to this name -- and letting either escape would replace
 * the caller's actionable "configured package was not found" with a diagnostic about the repository's shape.
 */
function discoverWorkspacesOrNone(fromDir: string): Workspace[] {
  try {
    return discoverWorkspacesAt(fromDir);
  } catch {
    return [];
  }
}

// endregion | Helpers
