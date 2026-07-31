import { existsSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { isRecord } from './isRecord.ts';
import { jitiImport } from './jitiImport.ts';
import type { RdyConfig, ResolvedRdyConfig } from './types.ts';

/** Default config values when no config file is found, or when one cannot be evaluated. */
export const DEFAULT_CONFIG: ResolvedRdyConfig = {
  compile: {
    srcDir: '.readyup/kits',
    outDir: '.readyup/kits',
    include: undefined,
  },
  internal: {
    dir: '.',
    infix: undefined,
  },
  packages: [],
};

/** Ordered lookup paths for the config file, resolved relative to `process.cwd()`. */
const LOOKUP_PATHS = ['.config/readyup.config.ts'];

/** Structural schema for RdyConfig. */
const RdyConfigSchema = z.looseObject({
  compile: z
    .looseObject({
      srcDir: z.string().optional(),
      outDir: z.string().optional(),
      include: z.string().optional(),
    })
    .optional(),
  internal: z
    .looseObject({
      dir: z.string().optional(),
      infix: z.string().optional(),
    })
    .optional(),
  packages: z.array(z.string()).optional(),
});

/** Validate that a raw value has the expected RdyConfig shape. */
function assertIsRdyConfig(raw: unknown): asserts raw is RdyConfig {
  RdyConfigSchema.parse(raw);
}

/**
 * Load readyup config from the filesystem.
 *
 * Checks `.config/readyup.config.ts` and returns defaults if not found.
 * An explicit override path skips the lookup chain.
 */
export async function loadConfig(overridePath?: string): Promise<ResolvedRdyConfig> {
  const resolvedPath = resolveConfigPath(overridePath);
  if (resolvedPath === undefined) {
    return { ...DEFAULT_CONFIG };
  }

  const imported = await jitiImport(
    resolvedPath,
    'External packages imported by the config file must be installed in the project.',
    'Config file',
  );

  // Support both default export and named exports
  const raw = imported.default !== undefined && isRecord(imported.default) ? imported.default : imported;

  assertIsRdyConfig(raw);

  return applyDefaults(raw);
}

/**
 * Locates the config file, or `undefined` when no lookup path holds one.
 *
 * An override path skips the lookup chain, and a file missing at that path is an error rather than a
 * fall-through to defaults: naming a config that is not there is a mistake, not a request for defaults.
 */
function resolveConfigPath(overridePath: string | undefined): string | undefined {
  if (overridePath !== undefined) {
    const resolvedPath = path.resolve(process.cwd(), overridePath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config not found: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  for (const lookupPath of LOOKUP_PATHS) {
    const candidate = path.resolve(process.cwd(), lookupPath);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Fills every key the config file left out with its default.
 *
 * The guards are redundant at runtime — Zod validated the shape already — but they narrow `raw`, which
 * is `Record<string, unknown> & RdyConfig` after the assertion.
 */
function applyDefaults(raw: Record<string, unknown> & RdyConfig): ResolvedRdyConfig {
  const compile = isRecord(raw.compile) ? raw.compile : undefined;
  const internal = isRecord(raw.internal) ? raw.internal : undefined;
  return {
    compile: {
      srcDir: typeof compile?.srcDir === 'string' ? compile.srcDir : DEFAULT_CONFIG.compile.srcDir,
      outDir: typeof compile?.outDir === 'string' ? compile.outDir : DEFAULT_CONFIG.compile.outDir,
      include: typeof compile?.include === 'string' ? compile.include : undefined,
    },
    internal: {
      dir: typeof internal?.dir === 'string' ? internal.dir : DEFAULT_CONFIG.internal.dir,
      infix: typeof internal?.infix === 'string' ? internal.infix : DEFAULT_CONFIG.internal.infix,
    },
    packages: Array.isArray(raw.packages) ? raw.packages.filter((name) => typeof name === 'string') : [],
  };
}
