import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { deepFreeze } from '../portable/deepFreeze.ts';
import { isRecord } from '../portable/isRecord.ts';
import { walkDirectories } from '../portable/walkDirectories.ts';
import { readJsonFile } from './json.ts';
import { readPnpmWorkspacePackages } from './pnpmWorkspaceYaml.ts';

/** A monorepo workspace, or the single workspace of a single-workspace repo. */
export interface Workspace {
  /** Workspace directory, relative to `cwd`. `'.'` for a single-workspace repo. */
  readonly dir: string;
  /** Absolute filesystem path to the workspace directory. */
  readonly absolutePath: string;
  /** `name` from the workspace's `package.json`; `undefined` if absent. */
  readonly name: string | undefined;
  /** True iff `package.json.private !== true`. (Equivalently: "this workspace is a package".) */
  readonly isPackage: boolean;
  /** Parsed `package.json` contents, validated to be a record. */
  readonly packageJson: Readonly<Record<string, unknown>>;
}

/** Options for `discoverWorkspaces`. */
export interface DiscoverWorkspacesOptions {
  /** Optional predicate. Workspaces returning false are omitted. */
  filter?: (workspace: Workspace) => boolean;
}

type WorkspacePatternSource = 'pnpm-workspace.yaml' | 'package.json';

/** Discovered workspaces by the `cwd` they were resolved against, held for the life of the process. */
const workspacesByCwd = new Map<string, Workspace[]>();

/**
 * Discovers the workspaces of the current repo.
 * Detects pnpm (`pnpm-workspace.yaml`), then npm/yarn (`package.json.workspaces`),
 * and falls back to a single-workspace repo using the root `package.json`.
 *
 * Memoized per `cwd` for the life of the process: repeated calls in one run share a single directory walk
 * and the frozen `Workspace` objects it built, and none of them observes a filesystem change made since the first.
 * `options.filter` applies per call, so it selects from the memoized list rather than being memoized with it.
 */
export function discoverWorkspaces(options?: DiscoverWorkspacesOptions): Workspace[] {
  const cwd = process.cwd();

  let workspaces = workspacesByCwd.get(cwd);
  if (workspaces === undefined) {
    // Build before storing, so a discovery that throws leaves nothing behind and the next call retries it.
    workspaces = buildWorkspaces(cwd);
    workspacesByCwd.set(cwd, workspaces);
  }

  return applyFilter(workspaces, options?.filter);
}

// region | Helpers

/** Applies the optional filter to a workspace list, answering with an array the caller owns either way. */
function applyFilter(workspaces: Workspace[], filter: DiscoverWorkspacesOptions['filter']): Workspace[] {
  if (filter === undefined) return [...workspaces];
  return workspaces.filter(filter);
}

/** Builds the unfiltered workspace list for the repo at `cwd`. */
function buildWorkspaces(cwd: string): Workspace[] {
  const rootPackageJsonPath = join(cwd, 'package.json');

  const patternResult = resolveWorkspacePatterns(cwd);

  if (patternResult === null) {
    // Single-workspace fallback uses the root package.json, which MUST exist.
    const rootPackageJson = readJsonFile(rootPackageJsonPath);
    if (rootPackageJson === undefined) {
      throw new Error(`Workspace discovery: no package.json found at ${rootPackageJsonPath}`);
    }
    return [buildWorkspaceFromPackageJson('.', cwd, rootPackageJson)];
  }

  // Monorepo path: still require a root package.json (both pnpm and npm workspaces do).
  if (!existsSync(rootPackageJsonPath)) {
    throw new Error(`Workspace discovery: no package.json found at ${rootPackageJsonPath}`);
  }

  // `matchedDirs` is already sorted ascending by `expandPatterns`, and each workspace's
  // `dir` equals its entry in that list, so the result is sorted without an extra pass.
  const matchedDirs = expandPatterns(cwd, patternResult.patterns, patternResult.source);
  const workspaces: Workspace[] = [];
  for (const relDir of matchedDirs) {
    const workspace = buildWorkspace(cwd, relDir);
    if (workspace !== undefined) {
      workspaces.push(workspace);
    }
  }

  return workspaces;
}

/**
 * Resolves the workspace pattern list for the repo at `cwd`.
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

  const rootPackageJson = readJsonFile(join(cwd, 'package.json'));
  if (rootPackageJson !== undefined) {
    const workspaces = rootPackageJson['workspaces'];
    const npmPatterns = extractNpmWorkspacePatterns(workspaces);
    if (npmPatterns !== null) {
      return { patterns: npmPatterns, source: 'package.json' };
    }
  }

  return null;
}

/** Extracts workspace patterns from the `workspaces` field of a root `package.json`. */
function extractNpmWorkspacePatterns(workspaces: unknown): string[] | null {
  if (Array.isArray(workspaces)) {
    const strings = workspaces.filter((entry): entry is string => typeof entry === 'string');
    if (strings.length !== workspaces.length) return null;
    return strings;
  }
  if (isRecord(workspaces)) {
    const nested = workspaces['packages'];
    if (Array.isArray(nested)) {
      const strings = nested.filter((entry): entry is string => typeof entry === 'string');
      if (strings.length !== nested.length) return null;
      return strings;
    }
  }
  return null;
}

/**
 * Expands each pattern into the workspace directories it names, as relative forward-slash paths,
 * sorted and deduplicated.
 *
 * Each pattern is rewritten to name the `package.json` inside the directories it matches, so
 * `walkDirectories` yields those directories.
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

  const match = patterns.map((pattern) => `${normalizePattern(pattern)}/package.json`);

  // The root is not a workspace, and a pattern of `**` translates to a glob matching its own manifest.
  return walkDirectories({ root: cwd, match }).filter((relDir) => relDir !== '.');
}

/**
 * Normalizes a workspace pattern.
 * Strips a trailing `/`, which would otherwise double the separator when the manifest name is appended.
 */
function normalizePattern(pattern: string): string {
  if (pattern.endsWith('/')) return pattern.slice(0, -1);
  return pattern;
}

/** Builds a `Workspace` for a relative directory; returns undefined if its `package.json` is missing or malformed. */
function buildWorkspace(cwd: string, relDir: string): Workspace | undefined {
  const absoluteDir = resolve(cwd, relDir);
  const packageJson = readJsonFile(join(absoluteDir, 'package.json'));
  if (packageJson === undefined) return undefined;
  return buildWorkspaceFromPackageJson(relDir, absoluteDir, packageJson);
}

/** Builds a `Workspace` from a relative dir, absolute path, and a parsed `package.json`. */
function buildWorkspaceFromPackageJson(
  relDir: string,
  absolutePath: string,
  packageJson: Record<string, unknown>,
): Workspace {
  const nameValue = packageJson['name'];
  const name = typeof nameValue === 'string' ? nameValue : undefined;
  const isPackage = packageJson['private'] !== true;
  // One call's mutation would otherwise reach every later call, which shares these objects.
  deepFreeze(packageJson);
  return Object.freeze({ dir: relDir, absolutePath, name, isPackage, packageJson });
}

// endregion | Helpers
