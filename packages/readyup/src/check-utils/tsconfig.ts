import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { parse as parseJsonc } from 'jsonc-parser';

import { isRecord } from '../isRecord.ts';
import { resolvePackageRoot } from '../resolvePackageRoot.ts';

/** A tsconfig's `extends` chain, resolved to the configs it reaches. */
export interface TsconfigChain {
  /** Configs visited, entry config first, then parents in resolution order. */
  entries: TsconfigChainEntry[];
  /** `extends` references resolution could not follow: specifiers that do not resolve, configs that do not parse. */
  unresolvedExtends: UnresolvedExtends[];
}

/** One config in a resolved `extends` chain, holding what that config declares in its own right. */
export interface TsconfigChainEntry {
  /** `compilerOptions` of `config`, narrowed to a record; `{}` when absent or not an object. */
  compilerOptions: Record<string, unknown>;
  /** The config as parsed, with nothing inherited folded in and no values normalized. */
  config: Record<string, unknown>;
  /** Path of the config, cwd-relative. */
  path: string;
  /**
   * The `extends` specifier that reached this config; undefined for the entry config. This is the identity that
   * holds across install layouts, which `path` does not: pnpm resolves a package under `.pnpm` and a workspace
   * link under the directory it points at, so the same base config answers to two different paths.
   */
  specifier: string | undefined;
}

/** Effective language-level settings of a tsconfig, resolved through its `extends` chain. */
export interface TsconfigLanguageLevel {
  /** Config paths visited, entry file first, cwd-relative. */
  chain: string[];
  /** Effective `lib`, lowercased; `undefined` if no config in the chain declares it. */
  lib: string[] | undefined;
  /** Effective `target`, lowercased; `undefined` if no config in the chain declares it. */
  target: string | undefined;
  /** `extends` references resolution could not follow: specifiers that do not resolve, configs that do not parse. */
  unresolvedExtends: string[];
}

/** An `extends` reference resolution could not follow, and the config that declared it. */
export interface UnresolvedExtends {
  /** Path of the config declaring the reference, cwd-relative. */
  from: string;
  /** The `extends` specifier, verbatim. */
  specifier: string;
}

/** Accumulator threaded through the `extends` walk. */
interface Resolution {
  cwd: string;
  entries: TsconfigChainEntry[];
  unresolvedExtends: UnresolvedExtends[];
  visited: Set<string>;
}

/**
 * Reads a tsconfig's `extends` chain, resolving it as TypeScript does, and reports what each config it reaches
 * declares in its own right. Returns undefined if the entry file is missing or unparseable; unresolvable parents
 * are reported in `unresolvedExtends` rather than treated as failures.
 */
export function readTsconfigChain(relativePath: string): TsconfigChain | undefined {
  const cwd = process.cwd();
  const entryPath = resolve(cwd, relativePath);
  const entryConfig = readJsonFile(entryPath);
  if (entryConfig === undefined) return undefined;

  const resolution: Resolution = {
    cwd,
    entries: [],
    unresolvedExtends: [],
    visited: new Set([entryPath]),
  };
  visitConfig(entryConfig, entryPath, undefined, resolution);

  const { entries, unresolvedExtends } = resolution;
  return { entries, unresolvedExtends };
}

/**
 * Reads a tsconfig's effective `lib` and `target` from its `extends` chain. Returns undefined if the entry file is
 * missing or unparseable; unresolvable parents are reported in `unresolvedExtends` rather than treated as failures.
 */
export function readTsconfigLanguageLevel(relativePath: string): TsconfigLanguageLevel | undefined {
  const resolved = readTsconfigChain(relativePath);
  if (resolved === undefined) return undefined;

  const { entries, unresolvedExtends } = resolved;
  return {
    chain: entries.map((entry) => entry.path),
    lib: readNearestOption(entries, 'lib', readLib),
    target: readNearestOption(entries, 'target', readTarget),
    unresolvedExtends: unresolvedExtends.map((unresolved) => unresolved.specifier),
  };
}

// region | Helpers

/** Reports whether a package specifier names a subpath, which a scoped name reaches only at its third segment. */
function hasSubpath(specifier: string): boolean {
  const segmentCount = specifier.split('/').length;
  return segmentCount > (specifier.startsWith('@') ? 2 : 1);
}

/** Reports whether a path exists and is a regular file. */
function isFile(absolutePath: string): boolean {
  try {
    return statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

/** Normalizes an `extends` value to a list of specifiers, dropping non-string entries. */
function readExtends(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

/** Reads and JSONC-parses a JSON file. Returns undefined when the file is unreadable or is not an object. */
function readJsonFile(absolutePath: string): Record<string, unknown> | undefined {
  if (!isFile(absolutePath)) return undefined;
  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf8');
  } catch {
    return undefined;
  }
  const parsed: unknown = parseJsonc(content, [], { allowTrailingComma: true });
  if (!isRecord(parsed)) return undefined;
  return parsed;
}

/** Normalizes a declared `lib` to lowercased strings. Returns undefined when the value is not an array. */
function readLib(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.toLowerCase());
}

/**
 * Reads a compiler option from the nearest entry declaring it in a form `read` accepts. Entry order is resolution
 * order, so the first such entry is the declaration that overrides the rest, and a value `read` rejects leaves the
 * option to a config further along.
 */
function readNearestOption<T>(
  entries: TsconfigChainEntry[],
  key: string,
  read: (value: unknown) => T | undefined,
): T | undefined {
  for (const entry of entries) {
    const value = read(entry.compilerOptions[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Normalizes a declared `target` to lowercase. Returns undefined when the value is not a string. */
function readTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.toLowerCase();
}

/**
 * Resolves an `extends` specifier as TypeScript does: a path specifier against the extending config's
 * directory, and a package specifier through Node's resolver anchored there.
 */
function resolveExtendsPath(specifier: string, configDir: string): string | undefined {
  if (specifier.startsWith('.') || isAbsolute(specifier)) return resolvePathSpecifier(specifier, configDir);
  return resolvePackageSpecifier(specifier, configDir);
}

/**
 * Resolves a bare package name to the config the package declares, as TypeScript does: the `"."` entry of a
 * non-null `exports` map, else the manifest's `tsconfig` field, else `tsconfig.json` in the package root.
 *
 * Reaching the last two takes readyup's own walk, because `exports` exists to hide the directory they address.
 */
function resolvePackageDefaultConfig(packageName: string, configDir: string): string | undefined {
  const packageRoot = resolvePackageRoot(packageName, configDir);
  if (packageRoot === undefined) return undefined;

  const manifest = readJsonFile(resolve(packageRoot, 'package.json'));
  if (manifest === undefined) return undefined;
  // An `exports` map is exhaustive, so it answers for the package or nothing does. A null map has no
  // entries to answer with, and TypeScript reads it as no map at all.
  if ('exports' in manifest && manifest['exports'] !== null) {
    return resolveThroughNodeResolver(packageName, configDir);
  }

  const declared = manifest['tsconfig'];
  return resolvePathSpecifier(typeof declared === 'string' ? declared : './tsconfig.json', packageRoot);
}

/** Resolves a package specifier, which names either a subpath into a package or the package alone. */
function resolvePackageSpecifier(specifier: string, configDir: string): string | undefined {
  if (hasSubpath(specifier)) return resolveThroughNodeResolver(specifier, configDir);
  return resolvePackageDefaultConfig(specifier, configDir);
}

/**
 * Resolves a relative or absolute specifier against `baseDir`, retrying with a `.json` suffix as
 * TypeScript does for `"./base"`.
 */
function resolvePathSpecifier(specifier: string, baseDir: string): string | undefined {
  const candidate = resolve(baseDir, specifier);
  if (isFile(candidate)) return candidate;
  const withJsonSuffix = `${candidate}.json`;
  if (isFile(withJsonSuffix)) return withJsonSuffix;
  return undefined;
}

/**
 * Resolves a package specifier through Node's resolver anchored at the extending config, so `exports`
 * governs what is reachable and a pnpm symlink answers with the directory the package occupies.
 *
 * Resolution runs under the `require` condition, which is the condition TypeScript resolves `extends`
 * under, so a specifier this reaches is a specifier `tsc` reaches.
 */
function resolveThroughNodeResolver(specifier: string, configDir: string): string | undefined {
  let resolved: string;
  try {
    // The anchor names a file that need not exist; only its directory takes part in resolution.
    resolved = createRequire(resolve(configDir, 'tsconfig.json')).resolve(specifier);
  } catch {
    return undefined;
  }
  // A core module such as `"fs/promises"` answers with its own name rather than with a path.
  if (!isAbsolute(resolved)) return undefined;
  // TypeScript resolves `extends` under a JSON-only extension set, so a package's entry point is not a config.
  return resolved.endsWith('.json') ? resolved : undefined;
}

/** Expresses an absolute path relative to cwd, using forward slashes. */
function toCwdRelative(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).split('\\').join('/');
}

/**
 * Records one config as a chain entry, then walks its parents. Parents are visited rightmost-first, because a
 * later `extends` entry overrides an earlier one and the nearer declaration is the one that must come first.
 */
function visitConfig(
  config: Record<string, unknown>,
  configPath: string,
  specifier: string | undefined,
  resolution: Resolution,
): void {
  resolution.entries.push({
    compilerOptions: isRecord(config['compilerOptions']) ? config['compilerOptions'] : {},
    config,
    path: toCwdRelative(resolution.cwd, configPath),
    specifier,
  });

  const parentSpecifiers = readExtends(config['extends']).toReversed();
  for (const parentSpecifier of parentSpecifiers) {
    visitParent(parentSpecifier, configPath, resolution);
  }
}

/** Resolves one `extends` specifier and records the parent config it reaches. */
function visitParent(specifier: string, configPath: string, resolution: Resolution): void {
  const from = toCwdRelative(resolution.cwd, configPath);
  const parentPath = resolveExtendsPath(specifier, dirname(configPath));
  if (parentPath === undefined) {
    resolution.unresolvedExtends.push({ from, specifier });
    return;
  }
  // A config reached twice (cycle or diamond) has already contributed everything it can.
  if (resolution.visited.has(parentPath)) return;
  resolution.visited.add(parentPath);

  const parentConfig = readJsonFile(parentPath);
  if (parentConfig === undefined) {
    resolution.unresolvedExtends.push({ from, specifier });
    return;
  }
  visitConfig(parentConfig, parentPath, specifier, resolution);
}

// endregion | Helpers
