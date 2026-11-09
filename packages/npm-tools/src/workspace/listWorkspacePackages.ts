import fs from 'node:fs';
import path from 'node:path';

import { type EmptyWorkspaceCause, findMonorepoRoot, resolveWorkspace } from '@williamthorsen/nmr-core/workspace';
import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * Lists the packages of the pnpm workspace that contains `cwd`, sorted by directory and excluding the root package.
 * Throws when a package's manifest cannot be read or parsed, naming the file.
 */
export function listWorkspacePackages(cwd: string): WorkspaceListing {
  const root = findMonorepoRoot(cwd);
  if (root === undefined) return { kind: 'not-a-workspace' };

  const resolution = resolveWorkspace(root);
  if (resolution.kind === 'not-a-workspace') return { kind: 'not-a-workspace' };
  if (resolution.kind === 'empty') return { kind: 'empty', root, cause: resolution.cause };

  const packages = resolution.packageDirs
    .filter((dir) => dir !== root)
    .map((dir) => readWorkspacePackage(root, dir))
    .sort((left, right) => left.directory.localeCompare(right.directory));

  return { kind: 'packages', root, packages };
}

/** A workspace package as its manifest declares it, with `null` for a field that the manifest does not set. */
export interface WorkspacePackage {
  readonly description: string | null;
  /** The package directory relative to the workspace root, with POSIX separators. */
  readonly directory: string;
  readonly name: string | null;
  readonly private: boolean;
  readonly version: string | null;
}

/** What listing a directory's workspace found. */
export type WorkspaceListing =
  | { readonly kind: 'empty'; readonly root: string; readonly cause: EmptyWorkspaceCause }
  | { readonly kind: 'not-a-workspace' }
  | { readonly kind: 'packages'; readonly root: string; readonly packages: readonly WorkspacePackage[] };

// region | Helpers

/** Reports whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the manifest at `manifestPath` as an object, throwing an error that names the file otherwise. */
function parseManifest(manifestPath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read ${manifestPath}: ${describeError(error)}`, { cause: error });
  }
  if (!isRecord(parsed)) throw new Error(`could not read ${manifestPath}: the manifest is not a JSON object`);

  return parsed;
}

/** Returns the property's value when it is a string, and `null` otherwise. */
function readString(manifest: Record<string, unknown>, key: string): string | null {
  const value = manifest[key];
  return typeof value === 'string' ? value : null;
}

/** Reads the manifest of the package in `dir`. */
function readWorkspacePackage(root: string, dir: string): WorkspacePackage {
  const manifest = parseManifest(path.join(dir, 'package.json'));

  return {
    description: readString(manifest, 'description'),
    directory: path.relative(root, dir).split(path.sep).join('/'),
    name: readString(manifest, 'name'),
    // npm refuses to publish only when the manifest sets `private` to `true`.
    private: manifest['private'] === true,
    version: readString(manifest, 'version'),
  };
}

// endregion | Helpers
