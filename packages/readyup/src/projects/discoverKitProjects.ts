import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { collectSourceFiles } from '../compile/collectSourceFiles.ts';
import { READYUP_DIR } from '../kitsDir.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { CONFIG_LOOKUP_PATHS, DEFAULT_CONFIG, loadConfig } from '../loadConfig.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { walkDirectories } from '../portable/walkDirectories.ts';
import type { ResolvedRdyConfig } from '../types.ts';
import { extractMessage } from '../utils/error-handling.ts';

/**
 * Glob naming the candidates a sweep considers: every directory holding a package manifest.
 *
 * Reading topology from the filesystem rather than from a workspace file is what keeps discovery
 * indifferent to which package manager the repo uses, and adds no dependency to parse one.
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
 *
 * That breadth is wider than a listing needs, deliberately: a caller that only renders compiled kits
 * filters, rather than narrowing the predicate and putting `compile --recursive` out of reach of the
 * projects it exists to visit.
 *
 * Each project's config is resolved rather than its path returned, because the predicate has already
 * paid for it and a caller that re-read it would pay twice.
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
  return enumerateKits({ dir: outDir, extension: '.js' }).length > 0;
}

/** Reports whether a project's `compile.srcDir` holds at least one TypeScript kit source. */
function hasKitSources(absolutePath: string, config: ResolvedRdyConfig): boolean {
  const srcDir = path.resolve(absolutePath, config.compile.srcDir);
  if (!existsSync(srcDir)) return false;
  return collectSourceFiles(srcDir, config.compile.include).length > 0;
}

/**
 * Reports whether a directory carries any readyup footprint at all, before any config is evaluated.
 *
 * Sound because a project with neither falls back to the default config, which points inside
 * `.readyup/`: declaring a source directory anywhere else takes a config file to say so. Settling this
 * first is what keeps the sweep from evaluating TypeScript in every workspace of a repo whose kits
 * live in one of them.
 */
function hasReadyupFootprint(absolutePath: string): boolean {
  if (existsSync(path.join(absolutePath, READYUP_DIR))) return true;
  return CONFIG_LOOKUP_PATHS.some((lookupPath) => existsSync(path.join(absolutePath, lookupPath)));
}

/**
 * Reports whether a candidate is a kit project, testing the clauses cheapest first.
 *
 * The manifest is one stat, the compiled kits one directory read, and the sources a recursive walk,
 * so the order costs a project nothing it does not need to spend.
 */
function holdsKits(absolutePath: string, config: ResolvedRdyConfig, manifestPath: string): boolean {
  return existsSync(manifestPath) || hasCompiledKits(absolutePath, config) || hasKitSources(absolutePath, config);
}

/**
 * Reads one project's config, falling back to the defaults when it cannot be evaluated.
 *
 * A config that fails costs that project its settings rather than its discovery, which is the
 * warn-and-continue the listing path already takes for the same failure.
 */
async function readProjectConfig(absolutePath: string, dir: string): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({ fromDir: absolutePath });
  } catch (error: unknown) {
    const detail = extractMessage(error).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Reading ${dir} with default settings.\n`);
    return { ...DEFAULT_CONFIG };
  }
}

// endregion | Helpers
