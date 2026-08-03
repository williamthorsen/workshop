import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { compareStrings } from '../portable/compareStrings.ts';
import { hashBytes } from '../portable/hash-content.ts';
import { hashDirectory } from '../portable/hashDirectory.ts';
import { readDirNames } from '../portable/readDirNames.ts';
import { statIfPresent } from '../portable/statIfPresent.ts';
import { toPosix } from '../portable/toPosix.ts';
import type { ResolveKind, SourceSpec } from '../schemas/catalog-schemas.ts';
import type { Hash, KindId } from '../schemas/scalar-schemas.ts';

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

// region | Helpers

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
 * One artifact at `name` under `rootDir`, or nothing when the entry is not one.
 *
 * A `file` kind's entry must be a file carrying the declared extension. A `directory` kind's must be a directory whose
 * entry file exists and is itself a file: a directory bearing the entry file's own name is not an artifact, and reading
 * a body that is not there is the failure that check prevents.
 */
async function readArtifact(rootDir: string, name: string, kind: ResolveKind): Promise<SourceArtifact | undefined> {
  const { layout } = kind;
  const entry = await statIfPresent(path.join(rootDir, name));
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

  const entryFile = await statIfPresent(path.join(rootDir, name, layout.entryFile));
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

// endregion | Helpers
