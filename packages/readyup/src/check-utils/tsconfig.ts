import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { parse as parseJsonc } from 'jsonc-parser';

import { isRecord } from '../isRecord.ts';

/** Effective language-level settings of a tsconfig, resolved through its `extends` chain. */
export interface TsconfigLanguageLevel {
  /** Effective `lib`, lowercased; `undefined` if no config in the chain declares it. */
  lib: string[] | undefined;
  /** Effective `target`, lowercased; `undefined` if no config in the chain declares it. */
  target: string | undefined;
  /** Config paths visited, entry file first, cwd-relative. */
  chain: string[];
  /** `extends` references resolution could not follow: bare specifiers, missing files, malformed configs. */
  unresolvedExtends: string[];
}

/** Accumulator threaded through the `extends` walk. */
interface Resolution {
  cwd: string;
  visited: Set<string>;
  chain: string[];
  unresolvedExtends: string[];
  lib: string[] | undefined;
  target: string | undefined;
}

/**
 * Reads a tsconfig's effective `lib` and `target`, resolving relative and array-form `extends`.
 * Returns undefined if the entry file is missing or unparseable; unresolvable parents are reported
 * in `unresolvedExtends` rather than treated as failures.
 */
export function readTsconfigLanguageLevel(relativePath: string): TsconfigLanguageLevel | undefined {
  const cwd = process.cwd();
  const entryPath = resolve(cwd, relativePath);
  const entryConfig = readTsconfigFile(entryPath);
  if (entryConfig === undefined) return undefined;

  const resolution: Resolution = {
    cwd,
    visited: new Set([entryPath]),
    chain: [toCwdRelative(cwd, entryPath)],
    unresolvedExtends: [],
    lib: undefined,
    target: undefined,
  };
  applyConfig(entryConfig, entryPath, resolution);

  const { lib, target, chain, unresolvedExtends } = resolution;
  return { lib, target, chain, unresolvedExtends };
}

// region | Helpers

/**
 * Folds one config into the resolution, then walks its parents. Fields already resolved are left
 * alone, so the nearest declaration wins; parents are visited rightmost-first because a later
 * `extends` entry overrides an earlier one.
 */
function applyConfig(config: Record<string, unknown>, configPath: string, resolution: Resolution): void {
  const compilerOptions = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  if (resolution.lib === undefined) {
    resolution.lib = readLib(compilerOptions.lib);
  }
  if (resolution.target === undefined) {
    resolution.target = readTarget(compilerOptions.target);
  }

  for (const specifier of readExtends(config.extends).toReversed()) {
    visitParent(specifier, configPath, resolution);
  }
}

/** Resolves one `extends` specifier and folds the parent config into the resolution. */
function visitParent(specifier: string, configPath: string, resolution: Resolution): void {
  const parentPath = resolveExtendsPath(specifier, dirname(configPath));
  if (parentPath === undefined) {
    resolution.unresolvedExtends.push(specifier);
    return;
  }
  // A config reached twice (cycle or diamond) has already contributed everything it can.
  if (resolution.visited.has(parentPath)) return;
  resolution.visited.add(parentPath);

  const parentConfig = readTsconfigFile(parentPath);
  if (parentConfig === undefined) {
    resolution.unresolvedExtends.push(specifier);
    return;
  }
  resolution.chain.push(toCwdRelative(resolution.cwd, parentPath));
  applyConfig(parentConfig, parentPath, resolution);
}

/**
 * Resolves a relative `extends` specifier against the extending config's directory, retrying with a
 * `.json` suffix as TypeScript does for `"./base"`. Bare package specifiers are not followed.
 */
function resolveExtendsPath(specifier: string, configDir: string): string | undefined {
  if (!specifier.startsWith('.') && !isAbsolute(specifier)) return undefined;
  const candidate = resolve(configDir, specifier);
  if (isFile(candidate)) return candidate;
  const withJsonSuffix = `${candidate}.json`;
  if (isFile(withJsonSuffix)) return withJsonSuffix;
  return undefined;
}

/** Reads and JSONC-parses a tsconfig. Returns undefined when the file is unreadable or is not an object. */
function readTsconfigFile(absolutePath: string): Record<string, unknown> | undefined {
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

/** Normalizes a declared `target` to lowercase. Returns undefined when the value is not a string. */
function readTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.toLowerCase();
}

/** Normalizes an `extends` value to a list of specifiers, dropping non-string entries. */
function readExtends(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

/** Reports whether a path exists and is a regular file. */
function isFile(absolutePath: string): boolean {
  try {
    return statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

/** Expresses an absolute path relative to cwd, using forward slashes. */
function toCwdRelative(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).split('\\').join('/');
}

// endregion | Helpers
