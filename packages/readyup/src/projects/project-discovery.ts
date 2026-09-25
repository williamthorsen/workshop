import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { collectSourceFiles } from '../compile/collectSourceFiles.ts';
import { CONFIG_LOOKUP_PATHS, DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { READYUP_DIR } from '../kits/kitsDir.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { isSkippableFilesystemError } from '../portable/isSkippableFilesystemError.ts';
import { toError } from '../portable/toError.ts';
import { walkDirectories } from '../portable/walkDirectories.ts';

/**
 * Glob naming the candidates considered by a sweep: every directory containing a package manifest.
 *
 * Topology comes from the filesystem, so discovery is indifferent to which package manager the repo uses.
 */
const CANDIDATE_GLOB = '**/package.json';

/** A directory in the swept tree that readyup reads as a project. */
export interface Project {
  /** Path relative to the sweep root, POSIX-separated; `'.'` for the root itself. */
  dir: string;
  absolutePath: string;
  /** The project's settings, or the defaults when `configError` is set. */
  config: ResolvedRdyConfig;
  /** The failure raised by evaluating the project's config file. */
  configError?: Error;
  /** Where the project's manifest belongs, whether or not one exists there. */
  manifestPath: string;
}

/** Options for the sweeps below. */
export interface DiscoverProjectsOptions {
  /** Directory from which the sweep descends. */
  root?: string;
}

/**
 * Returns the kit projects in the tree below `root`, each resolved under its own config, root-first.
 *
 * A candidate counts as a kit project when it has TypeScript kit sources in its `compile.srcDir`, or
 * compiled kits in its `compile.outDir`, or a manifest. The three are alternatives because they name
 * three states of the same project: authored but never compiled, compiled, and compiled but since
 * emptied. A manifest counts on existence alone, however many kits it currently lists, which keeps a
 * project whose kits were deleted discoverable by the sweep that would rewrite its manifest.
 *
 * A candidate whose config cannot be evaluated counts as well. Its directories are unknown, so the
 * defaults cannot show whether it contains kits, and a caller that must not act on those defaults still
 * has to learn that the project is there.
 */
export async function discoverKitProjects(options: DiscoverProjectsOptions = {}): Promise<Project[]> {
  const projects = await discoverProjects(options);

  return projects.filter(
    (project) =>
      hasReadyupFootprint(project.absolutePath) &&
      (project.configError !== undefined || holdsKits(project.absolutePath, project.config, project.manifestPath)),
  );
}

/**
 * Returns every project in the tree below `root`, each resolved under its own config, root-first.
 *
 * A project is any directory containing a package manifest, whatever its relationship to readyup. That is
 * the set that the dependency axis checks: A workspace authoring no kits of its own still declares
 * dependencies that publish them, and it does not need a readyup footprint to have any.
 */
export async function discoverProjects(options: DiscoverProjectsOptions = {}): Promise<Project[]> {
  const { root = process.cwd() } = options;

  const candidates = walkDirectories({ root, match: CANDIDATE_GLOB });

  const projects: Project[] = [];
  for (const dir of candidates) {
    const absolutePath = dir === '.' ? root : path.join(root, dir);
    const { config, configError } = await readProjectConfig(absolutePath);
    const manifestPath = path.join(absolutePath, DEFAULT_MANIFEST_PATH);

    projects.push({ dir, absolutePath, config, ...(configError !== undefined && { configError }), manifestPath });
  }

  return projects;
}

// region | Helpers

/** Reports whether a project's `compile.outDir` contains at least one compiled kit. */
function hasCompiledKits(absolutePath: string, config: ResolvedRdyConfig): boolean {
  const outDir = path.resolve(absolutePath, config.compile.outDir);
  try {
    return enumerateKits({ dir: outDir, extension: '.js', recursive: true }).length > 0;
  } catch (error: unknown) {
    return skipUnreadableDir(outDir, error);
  }
}

/** Reports whether a project's `compile.srcDir` contains at least one TypeScript kit source. */
function hasKitSources(absolutePath: string, config: ResolvedRdyConfig): boolean {
  const srcDir = path.resolve(absolutePath, config.compile.srcDir);
  if (!existsSync(srcDir)) return false;
  try {
    return collectSourceFiles(srcDir, config.compile).length > 0;
  } catch (error: unknown) {
    return skipUnreadableDir(srcDir, error);
  }
}

/**
 * Reports whether a directory has any readyup footprint at all.
 *
 * A project with neither falls back to the default config, which points inside `.readyup/`: Declaring a
 * source directory anywhere else requires a config file. Testing this before the directory reads
 * below keeps the sweep from walking a source tree in every workspace of a repo whose kits live in one
 * of them.
 */
function hasReadyupFootprint(absolutePath: string): boolean {
  if (existsSync(path.join(absolutePath, READYUP_DIR))) return true;
  return CONFIG_LOOKUP_PATHS.some((lookupPath) => existsSync(path.join(absolutePath, lookupPath)));
}

/**
 * Reports whether a candidate is a kit project, testing the clauses in increasing order of work.
 *
 * The manifest is one stat, the compiled kits one directory read, and the sources a recursive walk.
 */
function holdsKits(absolutePath: string, config: ResolvedRdyConfig, manifestPath: string): boolean {
  return existsSync(manifestPath) || hasCompiledKits(absolutePath, config) || hasKitSources(absolutePath, config);
}

/** The settings read for one project, with the failure that caused a fallback to the defaults. */
interface ProjectConfigRead {
  config: ResolvedRdyConfig;
  configError?: Error;
}

/**
 * Reads one project's config, falling back to the defaults and returning the failure when it cannot be evaluated.
 *
 * When a config fails, its project loses its settings but is still discovered, and the caller decides what the
 * failure means for it. A project declaring no config needs one `existsSync` and evaluates no TypeScript,
 * which lets every candidate be resolved before any of them is judged a kit project.
 */
async function readProjectConfig(absolutePath: string): Promise<ProjectConfigRead> {
  try {
    return { config: await loadConfig({ fromDir: absolutePath }) };
  } catch (error: unknown) {
    return { config: { ...DEFAULT_CONFIG }, configError: toError(error) };
  }
}

/** Returns `false` for a directory that the sweep cannot read, rethrowing a failure that it cannot skip past. */
function skipUnreadableDir(dir: string, error: unknown): false {
  if (!isSkippableFilesystemError(error)) throw error;
  process.stderr.write(`Warning: Cannot read ${dir}. Reading the project without it.\n`);
  return false;
}

// endregion | Helpers
