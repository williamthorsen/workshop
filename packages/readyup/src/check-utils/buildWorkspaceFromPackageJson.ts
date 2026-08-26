import { deepFreeze } from '../portable/deepFreeze.ts';
import type { Workspace } from './workspaces.ts';

/** Builds a `Workspace`, deep-freezing the manifest it is given. */
export function buildWorkspaceFromPackageJson(
  relDir: string,
  absolutePath: string,
  packageJson: Record<string, unknown>,
): Workspace {
  const nameValue = packageJson['name'];
  const name = typeof nameValue === 'string' ? nameValue : undefined;
  const isPackage = packageJson['private'] !== true;
  // A `Workspace`'s manifest is frozen, so no holder's write reaches another.
  deepFreeze(packageJson);
  return Object.freeze({ dir: relDir, absolutePath, name, isPackage, isRoot: relDir === '.', packageJson });
}
