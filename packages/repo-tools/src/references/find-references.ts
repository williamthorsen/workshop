import fs from 'node:fs';
import path from 'node:path';

import { grepTrackedFiles } from '../git/git-clone.ts';
import { expandTilde, formatDisplayPath } from '../portable/paths.ts';

/** A place that still names an old path: a line of a file, or a symlink whose target is under the old path. */
export interface Reference {
  file: string;
  line: number | undefined;
  location: string;
  text: string;
}

/** The references found, and the repos or paths that could not be searched, each with its reason. */
export interface ReferenceReport {
  problems: string[];
  references: Reference[];
}

/** A registered clone to search, under the label by which its references are reported. */
export interface SearchedClone {
  dir: string;
  label: string;
}

/** The largest file, in bytes, that the walk of a search path reads. */
const MAX_FILE_BYTES = 1024 * 1024;

/** The leading bytes of a file in which a NUL byte marks it as binary. */
const SNIFF_BYTES = 8192;

/** The directories that the walk of a search path does not enter. */
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

/**
 * Reports whether `text` names `target`: an occurrence of `target` that is not followed by a character that could
 * extend a path segment's name. `workshop.live` and `workshop/src` name `workshop`; `workshop-api` does not.
 */
export function containsPath(text: string, target: string): boolean {
  for (let index = text.indexOf(target); index !== -1; index = text.indexOf(target, index + 1)) {
    if (!extendsName(text.charAt(index + target.length))) return true;
  }
  return false;
}

/**
 * Finds the references to any of the absolute `oldPaths`, in their absolute and `~` forms, in the tracked files of
 * each clone, and in the text files and the symlink targets under each search path.
 */
export function findReferences(
  oldPaths: readonly string[],
  clones: readonly SearchedClone[],
  searchPaths: readonly string[],
  home: string,
): ReferenceReport {
  const needles = [...new Set(oldPaths.flatMap((oldPath) => [oldPath, formatDisplayPath(oldPath, home)]))];
  const report: ReferenceReport = { problems: [], references: [] };
  for (const clone of clones) {
    const matches = grepTrackedFiles(clone.dir, needles);
    if (typeof matches === 'string') {
      report.problems.push(`cannot search ${clone.label}: ${matches}`);
      continue;
    }
    for (const match of matches) {
      if (needles.some((needle) => containsPath(match.text, needle))) {
        report.references.push({ file: match.file, line: match.line, location: clone.label, text: match.text.trim() });
      }
    }
  }
  for (const searchPath of searchPaths) {
    walkSearchPath(searchPath, { home, needles, oldPaths, report });
  }
  return report;
}

// region | Helpers

/** Returns the `code` of a filesystem error, such as `ENOENT`, or `unreadable`. */
function describeCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unreadable';
}

/** Reports whether a character could continue a path segment's name, so that a match ending before it is partial. */
function extendsName(character: string): boolean {
  return /[\w-]/.test(character);
}

/** The state of a walk of one search path. */
interface WalkState {
  home: string;
  needles: readonly string[];
  oldPaths: readonly string[];
  report: ReferenceReport;
}

/** Reports the lines of a text file that name an old path. Skips a file that is too large or binary. */
function scanFile(file: string, location: string, relative: string, state: WalkState): void {
  let content: Buffer;
  try {
    if (fs.statSync(file).size > MAX_FILE_BYTES) return;
    content = fs.readFileSync(file);
  } catch {
    return;
  }
  if (content.subarray(0, SNIFF_BYTES).includes(0)) return;
  for (const [index, line] of content.toString('utf8').split('\n').entries()) {
    if (state.needles.some((needle) => containsPath(line, needle))) {
      state.report.references.push({ file: relative, line: index + 1, location, text: line.trim() });
    }
  }
}

/** Reports a symlink whose target, resolved against the link's directory, is an old path or lies under one. */
function scanLink(link: string, location: string, relative: string, state: WalkState): void {
  let target: string;
  try {
    target = fs.readlinkSync(link);
  } catch {
    return;
  }
  const resolved = path.resolve(path.dirname(link), expandTilde(target, state.home));
  if (state.oldPaths.some((oldPath) => resolved.startsWith(oldPath) && !extendsName(resolved.charAt(oldPath.length)))) {
    state.report.references.push({ file: relative, line: undefined, location, text: `-> ${target}` });
  }
}

/** Walks a search path without following symlinks, scanning each file and each link. */
function walkSearchPath(searchPath: string, state: WalkState): void {
  const root = path.resolve(expandTilde(searchPath, state.home));
  const location = formatDisplayPath(root, state.home);
  const pending = [root];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (dir === root) state.report.problems.push(`cannot search ${location}: ${describeCode(error)}`);
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      if (entry.isSymbolicLink()) {
        scanLink(full, location, relative, state);
      } else if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(full);
      } else if (entry.isFile()) {
        scanFile(full, location, relative, state);
      }
    }
  }
}

// endregion | Helpers
