import process from 'node:process';

import type { ResolvedRdyConfig } from './types.ts';

/** The compile directories against which a project's own kits resolve. */
export type CompileDirectories = Pick<ResolvedRdyConfig['compile'], 'outDir' | 'srcDir'>;

/** Convention directory containing a project's readyup state, relative to a project root or the home directory. */
export const READYUP_DIR = '.readyup';

/**
 * Convention directory for kits, relative to a project root or the home directory.
 *
 * It roots a layout that another project publishes: `--from`, `global`, and `npm:` resolve against it,
 * which lets `list` fall back to enumerating the same files that `run` would load when no manifest
 * is beside them, and readyup's own `packaging` check requires a published package to conform to it. A project's own
 * kits resolve against its configured directories instead, through `resolveKitRoot`.
 */
export const KITS_DIR = `${READYUP_DIR}/kits`;

/** Returns the home directory at which the `global` kit source is rooted, on any platform. */
export function resolveHomeDir(): string {
  return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '~';
}

/**
 * Returns the directory under which a project's own kits resolve: its sources under `--jit`, its bundles
 * otherwise.
 *
 * Falls back to the convention directory when no config was loaded, which is the path that an external
 * source flag takes.
 */
export function resolveKitRoot(compile: CompileDirectories | undefined, jit: boolean): string {
  if (compile === undefined) return KITS_DIR;
  return jit ? compile.srcDir : compile.outDir;
}
