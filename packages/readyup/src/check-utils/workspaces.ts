import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { deepFreeze } from '../portable/deepFreeze.ts';
import { isRecord } from '../portable/isRecord.ts';
import { walkDirectories } from '../portable/walkDirectories.ts';
import { readJsonFile } from './json.ts';
import { readPnpmWorkspacePackages } from './pnpmWorkspaceYaml.ts';

/** A repo's root, or one of a monorepo's members. */
export interface Workspace {
  /** Workspace directory, relative to the directory discovery was anchored to. `'.'` for the repo root. */
  readonly dir: string;
  /** Absolute filesystem path to the workspace directory. */
  readonly absolutePath: string;
  /** `name` from the workspace's `package.json`; `undefined` if absent. */
  readonly name: string | undefined;
  /** True iff `package.json.private !== true`. (Equivalently: "this workspace is a package".) */
  readonly isPackage: boolean;
  /** True for the repo root, which every repo shape reports. Independent of `isPackage`: a root may publish. */
  readonly isRoot: boolean;
  /** Parsed `package.json` contents, validated to be a record. */
  readonly packageJson: Readonly<Record<string, unknown>>;
}

/** Options for `discoverWorkspaces`. */
export interface DiscoverWorkspacesOptions {
  /** Optional predicate. Workspaces returning false are omitted. */
  filter?: (workspace: Workspace) => boolean;
}

type WorkspacePatternSource = 'pnpm-workspace.yaml' | 'package.json';

/** Discovered workspaces by the directory they were resolved against, held for the life of the process. */
const workspacesByDir = new Map<string, Workspace[]>();

/**
 * Discovers the workspaces of the current repo.
 * Detects pnpm (`pnpm-workspace.yaml`), then npm/yarn (`package.json.workspaces`),
 * and falls back to a single-workspace repo using the root `package.json`.
 *
 * The repo root is reported in every shape, once, flagged `isRoot`, so a caller wanting the members alone
 * filters `!isRoot` rather than reconstructing the distinction from `dir`.
 *
 * Memoized per directory for the life of the process: repeated calls in one run share a single directory walk
 * and the frozen `Workspace` objects it built, and none of them observes a filesystem change made since the first.
 * `options.filter` applies per call, so it selects from the memoized list rather than being memoized with it.
 */
export function discoverWorkspaces(options?: DiscoverWorkspacesOptions): Workspace[] {
  return discoverWorkspacesAt(process.cwd(), options);
}

/**
 * Discovers the workspaces of the repo rooted at `dir`, which a relative path names against `cwd`.
 *
 * The directory-taking half of `discoverWorkspaces`, for a caller resolving against a project other than the
 * one it is running in. It stays out of `check-utils`'s exports: a kit runs in the project it checks, so the
 * ambient answer is the one a kit author wants.
 */
export function discoverWorkspacesAt(dir: string, options?: DiscoverWorkspacesOptions): Workspace[] {
  // Resolve before keying the memo, so a relative path and its absolute form share one discovery.
  const rootDir = resolve(dir);

  let workspaces = workspacesByDir.get(rootDir);
  if (workspaces === undefined) {
    // Build before storing, so a discovery that throws leaves nothing behind and the next call retries it.
    workspaces = buildWorkspaces(rootDir);
    workspacesByDir.set(rootDir, workspaces);
  }

  return applyFilter(workspaces, options?.filter);
}

// region | Helpers

/** Applies the optional filter to a workspace list, answering with an array the caller owns either way. */
function applyFilter(workspaces: Workspace[], filter: DiscoverWorkspacesOptions['filter']): Workspace[] {
  if (filter === undefined) return [...workspaces];
  return workspaces.filter(filter);
}

/** Builds the unfiltered workspace list for the repo at `rootDir`, the root entry leading it. */
function buildWorkspaces(rootDir: string): Workspace[] {
  // The root is reported in every repo shape, so its manifest MUST be readable in every shape.
  const rootPackageJsonPath = join(rootDir, 'package.json');
  const rootPackageJson = readJsonFile(rootPackageJsonPath);
  if (rootPackageJson === undefined) {
    throw new Error(`Workspace discovery: no readable package.json at ${rootPackageJsonPath}`);
  }
  const rootWorkspace = buildWorkspaceFromPackageJson('.', rootDir, rootPackageJson);

  const patternResult = resolveWorkspacePatterns(rootDir, rootPackageJson);
  if (patternResult === null) return [rootWorkspace];

  // `matchedDirs` is already sorted ascending by `expandPatterns` and holds no `.`, and each workspace's
  // `dir` equals its entry in that list, so the root leads a sorted result without an extra pass.
  const matchedDirs = expandPatterns(rootDir, patternResult.patterns, patternResult.source);
  const workspaces: Workspace[] = [rootWorkspace];
  for (const relDir of matchedDirs) {
    const workspace = buildWorkspace(rootDir, relDir);
    if (workspace !== undefined) {
      workspaces.push(workspace);
    }
  }

  return workspaces;
}

/**
 * Resolves the workspace pattern list for the repo at `rootDir`, whose parsed root manifest is `rootPackageJson`.
 * Returns `null` to signal single-workspace fallback, or `{ patterns, source }` for a monorepo.
 */
function resolveWorkspacePatterns(
  rootDir: string,
  rootPackageJson: Record<string, unknown>,
): { patterns: string[]; source: WorkspacePatternSource } | null {
  const pnpmWorkspacePath = join(rootDir, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    const patterns = readPnpmWorkspacePackages(pnpmWorkspacePath);
    if (patterns !== null) {
      return { patterns, source: 'pnpm-workspace.yaml' };
    }
    // `packages` key absent — fall through to npm/single detection.
  }

  const npmPatterns = extractNpmWorkspacePatterns(rootPackageJson['workspaces']);
  if (npmPatterns !== null) {
    return { patterns: npmPatterns, source: 'package.json' };
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
function expandPatterns(rootDir: string, patterns: string[], source: WorkspacePatternSource): string[] {
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

  // A pattern of `**` translates to a glob matching the root's own manifest; `buildWorkspaces` reports the
  // root in its own right, so dropping it here is what leaves exactly one entry for it.
  return walkDirectories({ root: rootDir, match }).filter((relDir) => relDir !== '.');
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
function buildWorkspace(rootDir: string, relDir: string): Workspace | undefined {
  const absoluteDir = resolve(rootDir, relDir);
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
  return Object.freeze({ dir: relDir, absolutePath, name, isPackage, isRoot: relDir === '.', packageJson });
}

// endregion | Helpers
