import { deepFreeze } from '../portable/deepFreeze.ts';

/** A repo's root, or one of a monorepo's members. */
export interface Workspace {
  /** Workspace directory, relative to the directory discovery was anchored to. `'.'` for the repo root. */
  readonly dir: string;
  /** Absolute filesystem path to the workspace directory. */
  readonly absolutePath: string;
  /** `name` from the workspace's `package.json`; `undefined` if absent. */
  readonly name: string | undefined;
  /** `true` iff `package.json.private !== true`. (Equivalently: "this workspace is a package".) */
  readonly isPackage: boolean;
  /** `true` for the repo root, which every repo shape reports. Independent of `isPackage`: a root may publish. */
  readonly isRoot: boolean;
  /** Parsed `package.json` contents, validated to be a record. */
  readonly packageJson: Readonly<Record<string, unknown>>;
}

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
