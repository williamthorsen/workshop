import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors/candidate';

import { collectSourceFiles } from '../compile/collectSourceFiles.ts';
import { CONFIG_LOOKUP_PATHS, DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { READYUP_DIR } from '../kits/kitsDir.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { isSkippableFilesystemError } from '../portable/isSkippableFilesystemError.ts';
import { walkDirectories } from '../portable/walkDirectories.ts';

/**
 * Glob naming the candidates a sweep considers: every directory holding a package manifest.
 *
 * Topology comes from the filesystem, so discovery is indifferent to which package manager the repo uses.
 */
const CANDIDATE_GLOB = '**/package.json';

/** A directory in the swept tree that readyup reads as a kit project. */
export interface KitProject {
  /** Path relative to the sweep root, POSIX-separated; `'.'` for the root itself. */
  dir: string;
  absolutePath: string;
  config: ResolvedRdyConfig;
  /** Where the project's manifest belongs, whether or not one sits there. */
  manifestPath: string;
}

/** Options for `discoverKitProjects`. */
export interface DiscoverKitProjectsOptions {
  /** Directory the sweep descends from. */
  root?: string;
}

/**
 * Returns the kit projects in the tree below `root`, each resolved under its own config, root-first.
 *
 * A candidate counts as a kit project when it has TypeScript kit sources in its `compile.srcDir`, or
 * compiled kits in its `compile.outDir`, or a manifest. The three are alternatives because they name
 * three states of the same project: authored but never compiled, compiled, and compiled but since
 * emptied. A manifest counts on existence alone, however many kits it currently lists, which is what
 * keeps a project whose kits were deleted discoverable by the sweep that would rewrite its manifest.
 */
export async function discoverKitProjects(options: DiscoverKitProjectsOptions = {}): Promise<KitProject[]> {
  const { root = process.cwd() } = options;

  const candidates = walkDirectories({ root, match: CANDIDATE_GLOB });

  const projects: KitProject[] = [];
  for (const dir of candidates) {
    const absolutePath = dir === '.' ? root : path.join(root, dir);
    if (!hasReadyupFootprint(absolutePath)) continue;

    const config = await readProjectConfig(absolutePath, dir);
    const manifestPath = path.join(absolutePath, DEFAULT_MANIFEST_PATH);
    if (!holdsKits(absolutePath, config, manifestPath)) continue;

    projects.push({ dir, absolutePath, config, manifestPath });
  }

  return projects;
}

// region | Helpers

/** Reports whether a project's `compile.outDir` holds at least one compiled kit. */
function hasCompiledKits(absolutePath: string, config: ResolvedRdyConfig): boolean {
  const outDir = path.resolve(absolutePath, config.compile.outDir);
  try {
    return enumerateKits({ dir: outDir, extension: '.js' }).length > 0;
  } catch (error: unknown) {
    return skipUnreadableDir(outDir, error);
  }
}

/** Reports whether a project's `compile.srcDir` holds at least one TypeScript kit source. */
function hasKitSources(absolutePath: string, config: ResolvedRdyConfig): boolean {
  const srcDir = path.resolve(absolutePath, config.compile.srcDir);
  if (!existsSync(srcDir)) return false;
  try {
    return collectSourceFiles(srcDir, config.compile.include).length > 0;
  } catch (error: unknown) {
    return skipUnreadableDir(srcDir, error);
  }
}

/**
 * Reports whether a directory carries any readyup footprint at all, before any config is evaluated.
 *
 * A project with neither falls back to the default config, which points inside `.readyup/`: declaring a
 * source directory anywhere else takes a config file to say so. Settling this first keeps the sweep from
 * evaluating TypeScript in every workspace of a repo whose kits live in one of them.
 */
function hasReadyupFootprint(absolutePath: string): boolean {
  if (existsSync(path.join(absolutePath, READYUP_DIR))) return true;
  return CONFIG_LOOKUP_PATHS.some((lookupPath) => existsSync(path.join(absolutePath, lookupPath)));
}

/**
 * Reports whether a candidate is a kit project, testing the clauses cheapest first.
 *
 * The manifest is one stat, the compiled kits one directory read, and the sources a recursive walk.
 */
function holdsKits(absolutePath: string, config: ResolvedRdyConfig, manifestPath: string): boolean {
  return existsSync(manifestPath) || hasCompiledKits(absolutePath, config) || hasKitSources(absolutePath, config);
}

/**
 * Reads one project's config, falling back to the defaults when it cannot be evaluated.
 *
 * Discovery is read-only, so a config that fails costs that project its settings, not its discovery.
 */
async function readProjectConfig(absolutePath: string, dir: string): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({ fromDir: absolutePath });
  } catch (error: unknown) {
    const detail = describeError(error).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Reading ${dir} with default settings.\n`);
    return { ...DEFAULT_CONFIG };
  }
}

/** Answers `false` for a directory the sweep cannot read, rethrowing a failure it cannot skip past. */
function skipUnreadableDir(dir: string, error: unknown): false {
  if (!isSkippableFilesystemError(error)) throw error;
  process.stderr.write(`Warning: Cannot read ${dir}. Reading the project without it.\n`);
  return false;
}

// endregion | Helpers
