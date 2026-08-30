import { readFile } from '../filesystem.ts';
import { listForeignPaths } from './listForeignPaths.ts';
import { listTrackedFiles } from './listTrackedFiles.ts';
import { recordSweep } from './sweepRecorder.ts';

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
 *
 * A project declares the rest of that category itself, through the `.gitattributes` entries `listForeignPaths` reads.
 */
const EXCLUDED_PATH_PATTERNS = [/(?:^|\/)node_modules\//, /(?:^|\/)\.readyup\/kits\/[^/]+\.js$/];

/** File text by path, by the `cwd` it was read under. A stored `undefined` marks a path that could not be read. */
const textsByCwd = new Map<string, Map<string, string | undefined>>();

/**
 * Reads one path's text, from the cache where a sweep already read it, and `undefined` where the path holds none.
 *
 * The exclusions governing what a sweep reads do not apply here. This reports on a path its caller already holds,
 * such as the one a finding names, rather than deciding what a sweep goes looking at.
 */
export function readSourceText(path: string): string | undefined {
  const texts = resolveTextCache(process.cwd());
  if (!texts.has(path)) {
    texts.set(path, readText(path));
  }
  return texts.get(path);
}

/**
 * Reads the project's tracked sources that `filter` selects, or `undefined` outside a git working tree.
 *
 * The filter decides a path before anything reads it, so an excluded file is never read. Text is held per `cwd` for
 * the life of the process, so a file two kits both select is read once, and each kit reads only the files the other
 * did not ask for. A path that cannot be read as text is omitted and remembered as unreadable, so a later filter
 * selecting it probes the filesystem no second time.
 *
 * The declared-foreign set is awaited here rather than consulted inside the loop, which keeps the loop synchronous.
 * That is what lets two sweeps the runner started together share the text cache: each runs to completion without
 * yielding, so the second finds what the first read.
 *
 * The paths returned are reported to the sweep recorder the runner has in scope, which is the evidence the
 * unused-pragma report rests on. A check reading the project this way declares nothing to have its sweep recorded.
 */
export async function readTrackedSources(filter?: PathFilter): Promise<readonly ProjectSource[] | undefined> {
  const tracked = await listTrackedFiles();
  if (tracked === undefined) return undefined;
  const foreign = await listForeignPaths();

  const sources: ProjectSource[] = [];
  for (const path of tracked) {
    if (isExcluded(path) || foreign.has(path)) continue;
    if (filter !== undefined && !filter(path)) continue;

    const text = readSourceText(path);
    if (text !== undefined) {
      sources.push({ path, text });
    }
  }

  recordSweep(sources.map((source) => source.path));
  return sources;
}

// region | Helpers

/** Reports whether a path is one no sweep reads. */
function isExcluded(path: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Reads a tracked path as text, returning `undefined` where it holds none.
 *
 * `git ls-files` names entries that are not files: a symlink to a directory, and the gitlink of a checked-out
 * submodule. Both exist, so only the read itself can tell them from a source.
 */
function readText(path: string): string | undefined {
  try {
    return readFile(path);
  } catch {
    return undefined;
  }
}

/** Returns the text cache belonging to `cwd`, opening one where this is the first sweep under it. */
function resolveTextCache(cwd: string): Map<string, string | undefined> {
  let texts = textsByCwd.get(cwd);
  if (texts === undefined) {
    texts = new Map();
    textsByCwd.set(cwd, texts);
  }
  return texts;
}

// endregion | Helpers
