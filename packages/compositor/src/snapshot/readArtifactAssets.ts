import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { compareStrings } from '../portable/compareStrings.ts';
import { encodeBlob } from '../portable/encodeBlob.ts';
import { hashBytes } from '../portable/hash-content.ts';
import { listFilesRecursively } from '../portable/listFilesRecursively.ts';
import { namesToolState } from '../portable/namesToolState.ts';
import { toPosix } from '../portable/toPosix.ts';
import type { Blob } from '../schemas/file-schemas.ts';
import type { Hash } from '../schemas/scalar-schemas.ts';

/** One file an artifact ships beside the file containing its frontmatter. */
export interface ArtifactAsset {
  /** Posix-separated and relative to the artifact's own directory, which is where it deploys under its name. */
  readonly relativePath: string;
  readonly hash: Hash;
  readonly body: Blob;
}

/**
 * Reads every file the artifact at `artifactDir` ships apart from `entryFile`.
 *
 * The entry file is the one a target's stages run over; everything else an artifact ships is copied byte for byte. The
 * split names no file type, which is what keeps a vocabulary of binary extensions out of an engine that has none, and
 * it is the only reading under which an image and a script beside a text artifact both survive.
 *
 * Only tool state is passed over, which is the rule the artifact's own digest is taken by, so what this reads and what
 * identifies the artifact cover the same files. An underscore-prefixed directory inside an artifact is shipped content,
 * unlike one standing beside artifacts at a kind's root.
 *
 * Ordered by path. A kind laid out one file per artifact ships nothing else, so nothing calls this for one.
 */
export async function readArtifactAssets(
  artifactDir: string,
  entryFile: string,
): Promise<ReadonlyArray<ArtifactAsset>> {
  const entryPath = toPosix(path.normalize(entryFile));
  const shipped = await listFilesRecursively(artifactDir, { skipName: namesToolState });
  const relativePaths = shipped.filter((relativePath) => relativePath !== entryPath).toSorted(compareStrings);

  return Promise.all(relativePaths.map((relativePath) => readAsset(artifactDir, relativePath)));
}

// region | Helpers

/** Reads one asset's body and hash. */
async function readAsset(artifactDir: string, relativePath: string): Promise<ArtifactAsset> {
  const bytes = await readFile(path.join(artifactDir, relativePath));
  return { relativePath, hash: hashBytes(bytes), body: encodeBlob(bytes) };
}

// endregion | Helpers
