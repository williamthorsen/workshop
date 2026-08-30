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

/** Paths no sweep reads, whatever a filter says of them; `readTrackedSources` states why each is dropped. */
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
 * Reads the project's tracked sources that `filter` selects, or `undefined` outside a git working tree. `undefined`
 * and an empty list are distinct results: a project that cannot be swept is not one that was swept and holds nothing,
 * which is why a check reaching for this skips on `undefined` rather than reporting a pass.
 *
 * The filter decides a path before anything reads it, so an excluded file is never read. Text is held per `cwd` for
 * the life of the process, so a file two kits both select is read once, and each kit reads only the files the other
 * did not ask for. A path that cannot be read as text is omitted and remembered as unreadable, so a later filter
 * selecting it probes the filesystem no second time. That cache lives here rather than in a kit because a compiled
 * kit leaves its `readyup` imports unbundled, making `check-utils` one module instance across every kit of a run.
 *
 * Two path sets are dropped whatever the filter returns for them. `node_modules/` and `.readyup/kits/*.js` are
 * excluded outright, the latter being readyup's own generated artifact, which a sweep would otherwise report back to
 * the author of the kit it was compiled from; that pattern names the default `compile.outDir`, so a project
 * compiling its kits elsewhere excludes that directory in its own filter. Beyond those, a tracked file the project
 * declares `linguist-generated` or `linguist-vendored` is dropped, so committed bundler output and vendored
 * third-party code stay out of every kit's sweep at once: a finding inside one is advice nobody can take, and the
 * file would count toward the adoption fraction the finding is reported against.
 *
 * Both attributes take a bare form and a `=true` form, and an explicit `=false` keeps the file in the sweep. The
 * declaration is read through `git check-attr`, so the pattern syntax, the nested `.gitattributes` files, and the
 * precedence rules are git's; no Linguist install is involved, and none of Linguist's built-in vendor heuristics
 * apply. Git resolves `$GIT_DIR/info/attributes`, `core.attributesFile`, and the system-wide file alongside the
 * tracked ones, so a file missing from a sweep may have been declared outside the repository altogether, and
 * `check-attr` reads the working tree, so an uncommitted declaration takes effect as it does for git itself. The
 * exclusion belongs to this reader alone; `listTrackedFiles` stays the raw listing it is.
 *
 * The declared-foreign set is resolved once beside the tracked listing rather than per path, so the loop stays a
 * plain pass over the listing.
 *
 * The paths returned are reported to the sweep recorder the runner has in scope, which is the evidence the
 * unused-pragma report rests on. A check reading the project this way declares nothing to have its sweep recorded,
 * and a sweep it reads in `skip` counts as much as one it reads in `check`.
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
