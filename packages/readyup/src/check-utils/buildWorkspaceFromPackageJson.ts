import { deepFreeze } from '../portable/deepFreeze.ts';
import type { Workspace } from './workspaces.ts';

/** Builds a `Workspace` from a relative dir, absolute path, and a parsed `package.json`. */
export function buildWorkspaceFromPackageJson(
  relDir: string,
  absolutePath: string,
  packageJson: Record<string, unknown>,
): Workspace {
  const nameValue = packageJson['name'];
  const name = typeof nameValue === 'string' ? nameValue : undefined;
  const isPackage = packageJson['private'] !== true;
  // One call's mutation would otherwise reach every later call, which shares these objects.
  deepFreeze(packageJson);
  return Object.freeze({ dir: relDir, absolutePath, name, isPackage, isRoot: relDir === '.', packageJson });
}
