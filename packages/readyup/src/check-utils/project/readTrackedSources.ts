import { readFile } from '../filesystem.ts';
import { listTrackedFiles } from './listTrackedFiles.ts';

/** Selects the tracked paths a sweep reads. */
export type PathFilter = (path: string) => boolean;

/** A tracked file and the text it holds. */
export interface ProjectSource {
  readonly path: string;
  readonly text: string;
}

/**
 * Paths no sweep reads, whatever a filter says of them. `node_modules/` is not the reader's own code, and
 * `.readyup/kits/*.js` is readyup's generated artifact, which a sweep would report back to the author of the kit it
 * was compiled from.
 */
const EXCLUDED_PATH_PATTERNS = [/(?:^|\/)node_modules\//, /(?:^|\/)\.readyup\/kits\/[^/]+\.js$/];

/** File text by path, by the `cwd` it was read under. A stored `undefined` marks a path that could not be read. */
const textsByCwd = new Map<string, Map<string, string | undefined>>();

/**
 * Reads the project's tracked sources that `filter` selects, or nothing outside a git working tree.
 *
 * The filter decides a path before anything reads it, so a caller never pays for a file it excluded. Text is held per
 * `cwd` for the life of the process, so a file two kits both select costs one read between them, and each pays only
 * for the remainder the other did not ask for. A path that cannot be read is omitted and remembered as unreadable,
 * so a later filter selecting it probes the filesystem no second time.
 */
export async function readTrackedSources(filter?: PathFilter): Promise<readonly ProjectSource[] | undefined> {
  const tracked = await listTrackedFiles();
  if (tracked === undefined) return undefined;

  const texts = resolveTextCache(process.cwd());
  const sources: ProjectSource[] = [];
  for (const path of tracked) {
    if (isExcluded(path)) continue;
    if (filter !== undefined && !filter(path)) continue;

    if (!texts.has(path)) {
      texts.set(path, readFile(path));
    }

    const text = texts.get(path);
    if (text !== undefined) {
      sources.push({ path, text });
    }
  }

  return sources;
}

// region | Helpers

/** Reports whether a path is one no sweep reads. */
function isExcluded(path: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/** Answers with the text cache belonging to `cwd`, opening one where this is the first sweep under it. */
function resolveTextCache(cwd: string): Map<string, string | undefined> {
  let texts = textsByCwd.get(cwd);
  if (texts === undefined) {
    texts = new Map();
    textsByCwd.set(cwd, texts);
  }
  return texts;
}

// endregion | Helpers
