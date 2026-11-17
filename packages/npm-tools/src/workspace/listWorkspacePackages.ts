import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '@williamthorsen/nmr-core';
import { type EmptyWorkspaceCause, findMonorepoRoot, resolveWorkspace } from '@williamthorsen/nmr-core/workspace';
import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * Lists the packages of the pnpm workspace that contains `cwd`, sorted by directory and excluding the root package.
 * Reports the first package manifest that cannot be read or parsed in place of the list.
 */
export function listWorkspacePackages(cwd: string): WorkspaceListing {
  const root = findMonorepoRoot(cwd);
  if (root === undefined) return { kind: 'not-a-workspace' };

  const resolution = resolveWorkspace(root);
  if (resolution.kind === 'not-a-workspace') return { kind: 'not-a-workspace' };
  if (resolution.kind === 'empty') {
    return { kind: 'empty', root, cause: resolution.cause, patterns: resolution.patterns };
  }

  const packages: WorkspacePackage[] = [];
  for (const dir of resolution.packageDirs) {
    if (dir === root) continue;

    const manifestPath = path.join(dir, 'package.json');
    const parsed = parseManifest(manifestPath);
    if (parsed.kind === 'unreadable') {
      return { kind: 'unreadable-package-manifest', root, manifestPath, reason: parsed.reason };
    }
    packages.push(buildWorkspacePackage(root, dir, parsed.manifest));
  }

  return {
    kind: 'packages',
    root,
    packages: packages.toSorted((left, right) => left.directory.localeCompare(right.directory)),
  };
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
  | {
      readonly kind: 'empty';
      readonly root: string;
      readonly cause: EmptyWorkspaceCause;
      /** The patterns that the workspace manifest declares, empty when it does not yield a pattern list. */
      readonly patterns: readonly string[];
    }
  | { readonly kind: 'not-a-workspace' }
  | { readonly kind: 'packages'; readonly root: string; readonly packages: readonly WorkspacePackage[] }
  | {
      readonly kind: 'unreadable-package-manifest';
      readonly root: string;
      readonly manifestPath: string;
      /** Why the manifest cannot be used, phrased to follow the manifest's path. */
      readonly reason: string;
    };

// region | Helpers

/** Builds the listing entry of the package in `dir` from its manifest. */
function buildWorkspacePackage(root: string, dir: string, manifest: Record<string, unknown>): WorkspacePackage {
  return {
    description: readString(manifest, 'description'),
    directory: path.relative(root, dir).split(path.sep).join('/'),
    name: readString(manifest, 'name'),
    // npm refuses to publish only when the manifest sets `private` to `true`.
    private: manifest['private'] === true,
    version: readString(manifest, 'version'),
  };
}

/** Parses the manifest at `manifestPath` as an object, or reports why it cannot. */
function parseManifest(
  manifestPath: string,
):
  | { readonly kind: 'parsed'; readonly manifest: Record<string, unknown> }
  | { readonly kind: 'unreadable'; readonly reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { kind: 'unreadable', reason: describeError(error) };
  }
  if (!isRecord(parsed)) return { kind: 'unreadable', reason: 'the manifest is not a JSON object' };

  return { kind: 'parsed', manifest: parsed };
}

/** Returns the property's value when it is a string, and `null` otherwise. */
function readString(manifest: Record<string, unknown>, key: string): string | null {
  const value = manifest[key];
  return typeof value === 'string' ? value : null;
}

// endregion | Helpers
