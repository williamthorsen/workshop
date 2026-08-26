import { buildWorkspaceFromPackageJson } from '../check-utils/buildWorkspaceFromPackageJson.ts';
import type { Workspace } from '../check-utils/workspaces.ts';

/** Directory a fixture reports when the caller names none. */
const DEFAULT_DIR = 'packages/example';

/** Root the default `absolutePath` is composed against. */
const FIXTURE_ROOT = '/repo';

/**
 * Builds a `Workspace` fixture, filling every field the caller leaves out.
 *
 * Defaults are derived rather than held as literals: `dir` decides `absolutePath` and the manifest name, and the
 * manifest decides `name`, `isPackage`, and `isRoot` through the same derivation `discoverWorkspaces` uses. A field
 * added to `Workspace` therefore reaches a fixture with the value discovery would give it.
 *
 * Overrides apply after the derivation, so a test that needs a shape discovery would not produce can still state it.
 * The result is frozen, as a discovered workspace is, and the manifest is copied before freezing so a literal shared
 * between fixtures is not frozen in the caller's hands.
 */
export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const dir = overrides.dir ?? DEFAULT_DIR;
  const absolutePath = overrides.absolutePath ?? composeAbsolutePath(dir);
  const packageJson = structuredClone(overrides.packageJson ?? { name: composeName(dir) });

  const derived = buildWorkspaceFromPackageJson(dir, absolutePath, packageJson);

  return Object.freeze({ ...derived, ...overrides, packageJson: derived.packageJson });
}

// region | Helpers

/** Composes the absolute path of a fixture directory, in forward slashes so a fixture reads the same on any platform. */
function composeAbsolutePath(dir: string): string {
  if (dir === '.') return FIXTURE_ROOT;
  return `${FIXTURE_ROOT}/${dir}`;
}

/** Composes the manifest name of a fixture directory: its last segment, or `repo` for the root. */
function composeName(dir: string): string {
  if (dir === '.') return 'repo';
  return dir.slice(dir.lastIndexOf('/') + 1);
}

// endregion | Helpers
