import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { isMissingFile } from '../portable/isMissingFile.ts';

/** Where to look for a package, and where that package declares the content directory it ships. */
export interface LocatePackageOptions {
  /** The directory package resolution is anchored at, which is the tier that declared the package. */
  readonly baseDir: string;
  /**
   * The key path into a package's own `package.json` that names its content directory, such as
   * `['compositor', 'content']`. Supplied rather than fixed, so no consumer's namespace is compiled in here.
   */
  readonly contentKeyPath: ReadonlyArray<string>;
}

/**
 * Locates the directory `name` ships its content in.
 *
 * Resolution walks the `node_modules` chain Node itself would search from `baseDir`, so it holds under pnpm's symlinked
 * layout and under workspace links, which is what lets a producing repo consume its own content through the declaration
 * a third party would write. Probing the filesystem rather than resolving a package subpath is deliberate: a modern
 * `exports` map does not expose `./package.json`, and a content-only package has no importable entry to resolve instead.
 *
 * Throws when the name is a filesystem path rather than a package name, when the package is not installed, or when it
 * declares no content directory. Whether that directory exists is left to the caller's source validation, so a package
 * source and a hand-declared one fail through one path.
 */
export async function locatePackage(name: string, options: LocatePackageOptions): Promise<string> {
  assertPackageName(name);

  const installed = await findInstalledPackage(name, options.baseDir);
  if (installed === undefined) {
    const searched = listCandidateDirs(name, options.baseDir).join(', ');
    throw new Error(`Declared package "${name}" is not installed. Searched: ${searched}.`);
  }
  return path.join(installed.dir, readContentPath(name, installed.manifest, options.contentKeyPath));
}

// region | Helpers

/**
 * Throws when `name` is a filesystem path rather than a package name.
 *
 * Node's resolver answers a relative specifier with the anchor directory itself, so `./content` would otherwise resolve
 * to `<baseDir>/content` and `../sibling` would escape `baseDir` entirely -- a second, undocumented directory-source
 * route beside the one a `path` declaration already provides.
 */
function assertPackageName(name: string): void {
  if (name.startsWith('.') || path.isAbsolute(name)) {
    throw new Error(
      `Declared package "${name}" is a filesystem path, not a package name. Declare it as a path instead.`,
    );
  }
}

/** Finds the installed directory of `name` with its parsed manifest, or nothing when no candidate carries one. */
async function findInstalledPackage(
  name: string,
  baseDir: string,
): Promise<{ dir: string; manifest: unknown } | undefined> {
  for (const dir of listCandidateDirs(name, baseDir)) {
    const raw = await readFileIfPresent(path.join(dir, 'package.json'));
    if (raw !== undefined) {
      return { dir, manifest: parseManifest(name, raw) };
    }
  }
  return undefined;
}

/** Lists the candidate installed directories for `name`, in the order Node's resolver searches them from `baseDir`. */
function listCandidateDirs(name: string, baseDir: string): ReadonlyArray<string> {
  // `createRequire` needs only a path to anchor resolution; the file itself need not exist.
  const requireFromBase = createRequire(path.join(baseDir, 'package.json'));
  // `resolve.paths` answers null for a core module, which a garbage declaration can produce; an empty candidate list
  // then reports it as not installed.
  return (requireFromBase.resolve.paths(name) ?? []).map((nodeModules) => path.join(nodeModules, name));
}

/** Parses the manifest text, naming the package so a syntax error is attributable. */
function parseManifest(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Package "${name}" has an unreadable package.json: ${message}`, { cause: error });
  }
}

/**
 * Reads the content directory `manifest` declares at `keyPath`.
 *
 * The key has no default, because a default location would claim a directory name in every producer's package root. A
 * producer states where its content lives and can nest it under a directory it already owns.
 */
function readContentPath(name: string, manifest: unknown, keyPath: ReadonlyArray<string>): string {
  let current: unknown = manifest;
  for (const key of keyPath) {
    if (typeof current !== 'object' || current === null) {
      current = undefined;
      break;
    }
    // A key the manifest does not carry reads as `undefined`, which the check below rejects along with every other
    // value that is not a directory name.
    const next: unknown = Reflect.get(current, key);
    current = next;
  }

  if (typeof current !== 'string' || current === '') {
    throw new Error(
      `Package "${name}" declares no content directory at "${keyPath.join('.')}" in its package.json. A package that ships content sets that key to a directory and includes the directory in its published "files".`,
    );
  }
  return current;
}

/**
 * Reads `filePath`, resolving to nothing when it is absent.
 *
 * Any other failure rethrows, so a permission problem surfaces instead of reading as a bare absence and sending
 * resolution on to the next candidate.
 */
async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers
