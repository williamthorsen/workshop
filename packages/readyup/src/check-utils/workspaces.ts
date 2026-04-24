import { type Dirent, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import picomatch from 'picomatch';

import { isRecord } from '../isRecord.ts';
import { readJsonFile } from './json.ts';
import { readPnpmWorkspacePackages } from './pnpmWorkspaceYaml.ts';

/** A monorepo workspace, or the single workspace of a single-workspace repo. */
export interface Workspace {
  /** Workspace directory, relative to `cwd`. `'.'` for a single-workspace repo. */
  dir: string;
  /** Absolute filesystem path to the workspace directory. */
  absolutePath: string;
  /** `name` from the workspace's `package.json`; `undefined` if absent. */
  name: string | undefined;
  /** True iff `package.json.private !== true`. (Equivalently: "this workspace is a package".) */
  isPackage: boolean;
  /** Parsed `package.json` contents, validated to be a record. */
  packageJson: Record<string, unknown>;
}

/** Options for `discoverWorkspaces`. */
export interface DiscoverWorkspacesOptions {
  /** Optional predicate. Workspaces returning false are omitted. */
  filter?: (workspace: Workspace) => boolean;
}

type WorkspacePatternSource = 'pnpm-workspace.yaml' | 'package.json';

/** Maximum recursion depth for the glob walk. */
const MAX_WALK_DEPTH = 10;

/** Directory names that are never traversed. */
const PRUNED_NAMES = new Set(['node_modules', '.git']);

/**
 * Discover the workspaces of the current repo.
 * Detects pnpm (`pnpm-workspace.yaml`), then npm/yarn (`package.json.workspaces`),
 * and falls back to a single-workspace repo using the root `package.json`.
 */
export function discoverWorkspaces(options?: DiscoverWorkspacesOptions): Workspace[] {
  const cwd = process.cwd();
  const rootPackageJsonPath = join(cwd, 'package.json');

  const patternResult = resolveWorkspacePatterns(cwd);

  if (patternResult === null) {
    // Single-workspace fallback uses the root package.json, which MUST exist.
    const rootPackageJson = readJsonFile('package.json');
    if (rootPackageJson === undefined) {
      throw new Error(`Workspace discovery: no package.json found at ${rootPackageJsonPath}`);
    }
    const workspace = buildWorkspaceFromPackageJson('.', cwd, rootPackageJson);
    return applyFilter([workspace], options?.filter);
  }

  // Monorepo path: still require a root package.json (both pnpm and npm workspaces do).
  if (!existsSync(rootPackageJsonPath)) {
    throw new Error(`Workspace discovery: no package.json found at ${rootPackageJsonPath}`);
  }

  const matchedDirs = expandPatterns(cwd, patternResult.patterns, patternResult.source);
  const workspaces: Workspace[] = [];
  for (const relDir of matchedDirs) {
    const workspace = buildWorkspace(cwd, relDir);
    if (workspace !== undefined) {
      workspaces.push(workspace);
    }
  }

  // eslint-disable-next-line unicorn/no-array-sort -- `toSorted` requires Node 20; this package supports Node 18.17+.
  const sortedWorkspaces = [...workspaces].sort((a, b) => compareDirs(a.dir, b.dir));
  return applyFilter(sortedWorkspaces, options?.filter);
}

// region | Helpers

/** Apply the optional filter to a workspace list. */
function applyFilter(workspaces: Workspace[], filter: DiscoverWorkspacesOptions['filter']): Workspace[] {
  if (filter === undefined) return workspaces;
  return workspaces.filter(filter);
}

/**
 * Resolve the workspace pattern list for the repo at `cwd`.
 * Returns `null` to signal single-workspace fallback, or `{ patterns, source }` for a monorepo.
 */
function resolveWorkspacePatterns(cwd: string): { patterns: string[]; source: WorkspacePatternSource } | null {
  const pnpmWorkspacePath = join(cwd, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    const patterns = readPnpmWorkspacePackages(pnpmWorkspacePath);
    if (patterns !== null) {
      return { patterns, source: 'pnpm-workspace.yaml' };
    }
    // `packages` key absent — fall through to npm/single detection.
  }

  const rootPackageJson = readJsonFile('package.json');
  if (rootPackageJson !== undefined) {
    const workspaces = rootPackageJson.workspaces;
    const npmPatterns = extractNpmWorkspacePatterns(workspaces);
    if (npmPatterns !== null) {
      return { patterns: npmPatterns, source: 'package.json' };
    }
  }

  return null;
}

/** Extract workspace patterns from the `workspaces` field of a root `package.json`. */
function extractNpmWorkspacePatterns(workspaces: unknown): string[] | null {
  if (Array.isArray(workspaces)) {
    const strings = workspaces.filter((entry): entry is string => typeof entry === 'string');
    if (strings.length !== workspaces.length) return null;
    return strings;
  }
  if (isRecord(workspaces)) {
    const nested = workspaces.packages;
    if (Array.isArray(nested)) {
      const strings = nested.filter((entry): entry is string => typeof entry === 'string');
      if (strings.length !== nested.length) return null;
      return strings;
    }
  }
  return null;
}

/**
 * Expand each pattern against a pruned recursive directory walk, returning relative
 * dir paths (forward-slash style) sorted and deduplicated.
 */
function expandPatterns(cwd: string, patterns: string[], source: WorkspacePatternSource): string[] {
  if (patterns.length === 0) return [];

  // Check for negation patterns up front — the pnpm reader already rejects these in YAML,
  // but npm `workspaces` entries come through untouched.
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      throw new Error(
        `Workspace discovery: negation pattern "${pattern}" in ${source} is not supported.\n` +
          'Negation patterns are not supported in this release of readyup.\n' +
          'If you need negation support, please open an issue.',
      );
    }
  }

  const matchers = patterns.map((pattern) => picomatch(normalizePattern(pattern)));
  const matched = new Set<string>();

  walk(cwd, '.', 0, (relDir) => {
    if (relDir === '.') return;
    if (matchers.some((isMatch) => isMatch(relDir))) {
      matched.add(relDir);
    }
  });

  // eslint-disable-next-line unicorn/no-array-sort -- toSorted() requires es2023 lib / Node 20+; this package supports Node 18.17+.
  return [...matched].sort();
}

/** Ascending lexicographic comparator for workspace dir strings. */
function compareDirs(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Normalize a workspace pattern.
 * Strips a trailing `/` because picomatch's `**` matches paths, not directories-with-slash.
 */
function normalizePattern(pattern: string): string {
  if (pattern.endsWith('/')) return pattern.slice(0, -1);
  return pattern;
}

/** Recursively walk `cwd` starting at `relDir`, calling `visit` for each directory. */
function walk(cwd: string, relDir: string, depth: number, visit: (relDir: string) => void): void {
  visit(relDir);
  if (depth >= MAX_WALK_DEPTH) return;

  const absDir = relDir === '.' ? cwd : join(cwd, relDir);
  let entries: Dirent[];
  try {
    entries = readdirSync(absDir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (PRUNED_NAMES.has(name)) continue;
    if (name.startsWith('.')) continue;
    const childRel = relDir === '.' ? name : `${relDir}/${name}`;
    walk(cwd, childRel, depth + 1, visit);
  }
}

/** Build a `Workspace` for a relative directory; returns undefined if its `package.json` is missing or malformed. */
function buildWorkspace(cwd: string, relDir: string): Workspace | undefined {
  const absoluteDir = resolve(cwd, relDir);
  const packageJsonRelativePath = relDir === '.' ? 'package.json' : `${relDir}/package.json`;
  const packageJson = readJsonFile(packageJsonRelativePath);
  if (packageJson === undefined) return undefined;
  return buildWorkspaceFromPackageJson(relDir, absoluteDir, packageJson);
}

/** Build a `Workspace` from a relative dir, absolute path, and a parsed `package.json`. */
function buildWorkspaceFromPackageJson(
  relDir: string,
  absolutePath: string,
  packageJson: Record<string, unknown>,
): Workspace {
  const nameValue = packageJson.name;
  const name = typeof nameValue === 'string' ? nameValue : undefined;
  const isPackage = packageJson.private !== true;
  return { dir: relDir, absolutePath, name, isPackage, packageJson };
}

// endregion | Helpers
