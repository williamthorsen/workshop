import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { hashBytes, hashUtf8 } from './hashContent.ts';
import type { Hash, KindId } from './schemas/common.ts';
import type { ResolveKind, SourceSpec } from './schemas/resolutionSchemas.ts';

/** One artifact a source carries, located and digested within that source. */
export interface SourceArtifact {
  readonly kindId: KindId;
  readonly slug: string;
  /** Posix-separated and relative to the source's own directory: the entry file a reader would open. */
  readonly path: string;
  /** Covers everything the artifact ships, not the entry file alone. */
  readonly hash: Hash;
}

/**
 * Every artifact `source` carries, across every kind in `kinds`.
 *
 * Enumerates rather than probes for a named slug, which is what makes shadowed candidates and "what does this source
 * carry" answerable at all. A kind whose root is absent from this source contributes nothing, because a source is free
 * to carry only some of the kinds in play; an unreadable root is a failure, so a permission problem cannot pass for an
 * empty one and let a lower-precedence source win by default.
 *
 * Results run by kind, in the order `kinds` gives, then by slug.
 */
export async function enumerateSource(
  source: SourceSpec,
  kinds: ReadonlyArray<ResolveKind>,
): Promise<ReadonlyArray<SourceArtifact>> {
  const perKind = await Promise.all(kinds.map((kind) => enumerateKind(source.dir, kind)));
  return perKind.flat();
}

/**
 * Throws unless `source` points at a readable directory.
 *
 * A source that is absent, or is a file where a directory was declared, is a mistake in the declaration rather than an
 * empty source, and every artifact it was meant to carry would otherwise resolve from somewhere else without a word.
 */
export async function assertSourceIsReadable(source: SourceSpec): Promise<void> {
  let entry;
  try {
    entry = await stat(source.dir);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      throw new Error(`Source "${source.name}" points at "${source.dir}", which does not exist.`, { cause: error });
    }
    throw error;
  }
  if (!entry.isDirectory()) {
    throw new Error(`Source "${source.name}" points at "${source.dir}", which is not a directory.`);
  }
}

// region | Helpers

/** Orders two strings by code point, which is what a consumer diffing two catalogs reproduces. */
function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Every artifact of one kind under `sourceDir`, ordered by slug. */
async function enumerateKind(sourceDir: string, kind: ResolveKind): Promise<Array<SourceArtifact>> {
  const rootDir = path.join(sourceDir, kind.layout.root);
  const names = (await readDirNames(rootDir)).filter((name) => isArtifactName(name));

  const artifacts = await Promise.all(names.map((name) => readArtifact(rootDir, name, kind)));
  return artifacts
    .filter((artifact): artifact is SourceArtifact => artifact !== undefined)
    .toSorted((left, right) => compareStrings(left.slug, right.slug));
}

/**
 * A digest over everything under `dir`, keyed by each file's path within it.
 *
 * Covers the whole artifact rather than its entry file alone, because a directory-shaped artifact ships assets beside
 * the file carrying its frontmatter and a rebuilt asset is a changed artifact. Paths take part in the digest, so moving
 * a file within the artifact moves the digest too. Dotfiles are left out as tool state rather than shipped content.
 */
async function hashDirectory(dir: string): Promise<Hash> {
  const relativePaths = (await listFilesRecursively(dir, '')).toSorted(compareStrings);
  const perFile = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const bytes = await readFile(path.join(dir, relativePath));
      return `${relativePath}\n${hashBytes(bytes)}`;
    }),
  );
  return hashUtf8(perFile.join('\n'));
}

/**
 * Reports whether `name` can name an artifact.
 *
 * A dot prefix is tool state and an underscore prefix is support content: an include target, a shared data directory,
 * anything a source keeps beside its artifacts. The rule is structural, so the engine excludes them without knowing
 * what any particular one is for.
 */
function isArtifactName(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('_');
}

/**
 * Reports whether `error` means the path is simply not there.
 *
 * `ENOTDIR` joins `ENOENT` because a probe below a path segment that turned out to be a regular file fails with the
 * former and means the same thing. Every other failure, `EACCES` above all, is a problem to surface rather than an
 * absence to skip past.
 */
function isMissingFile(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'ENOENT' || error.code === 'ENOTDIR';
}

/** Every file beneath `dir`, as posix paths relative to the walk's root. */
async function listFilesRecursively(dir: string, prefix: string): Promise<Array<string>> {
  const names = (await readDirNames(dir)).filter((name) => !name.startsWith('.'));
  const nested = await Promise.all(
    names.map(async (name) => {
      const relativePath = prefix === '' ? name : `${prefix}/${name}`;
      const entry = await statOrUndefined(path.join(dir, name));
      if (entry === undefined) {
        return [];
      }
      return entry.isDirectory() ? await listFilesRecursively(path.join(dir, name), relativePath) : [relativePath];
    }),
  );
  return nested.flat();
}

/**
 * One artifact at `name` under `rootDir`, or nothing when the entry is not one.
 *
 * A `file` kind's entry must be a file carrying the declared extension. A `directory` kind's must be a directory whose
 * entry file exists and is itself a file: a directory named `SKILL.md` does not make a skill, and reading a body that
 * is not there is the failure that check prevents.
 */
async function readArtifact(rootDir: string, name: string, kind: ResolveKind): Promise<SourceArtifact | undefined> {
  const { layout } = kind;
  const entry = await statOrUndefined(path.join(rootDir, name));
  if (entry === undefined) {
    return undefined;
  }

  if (layout.form === 'file') {
    if (!entry.isFile() || !name.endsWith(layout.extension) || name === layout.extension) {
      return undefined;
    }
    return {
      kindId: kind.id,
      slug: name.slice(0, name.length - layout.extension.length),
      path: toPosix(path.join(layout.root, name)),
      hash: hashBytes(await readFile(path.join(rootDir, name))),
    };
  }

  const entryFile = await statOrUndefined(path.join(rootDir, name, layout.entryFile));
  if (!entry.isDirectory() || entryFile?.isFile() !== true) {
    return undefined;
  }
  return {
    kindId: kind.id,
    slug: name,
    path: toPosix(path.join(layout.root, name, layout.entryFile)),
    hash: await hashDirectory(path.join(rootDir, name)),
  };
}

/** The entry names directly under `dir`, or none when `dir` is absent. */
async function readDirNames(dir: string): Promise<Array<string>> {
  try {
    return await readdir(dir);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * The stats of `filePath`, or nothing when it is absent.
 *
 * Follows symlinks, which `readdir`'s own file types do not: a symlinked artifact reports as a link rather than as the
 * directory it points at, and under a linked layout that would hide the artifact entirely.
 */
async function statOrUndefined(filePath: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(filePath);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

/** A path rendered with posix separators, so a catalog built on Windows matches one built anywhere else. */
function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

// endregion | Helpers
