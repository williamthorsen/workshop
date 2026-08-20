import { blankNonCode } from '../../portable/blankNonCode.ts';
import { discoverWorkspaces } from '../workspaces.ts';
import type { ProjectSource } from './readTrackedSources.ts';

/** The package a check is about, the exports whose definition marks a file as its implementation, and the swept sources. */
export interface OwnImplementation {
  packageName: string;
  exportNames: readonly string[];
  sources: readonly ProjectSource[];
}

/**
 * Reports whether a path holds the declared package's own implementation: a file inside the workspace publishing the
 * package that defines one of its recommended exports.
 *
 * Both halves are required. A repo publishing the package is where the idiom is supposed to live, but the workspace is
 * the whole repository in a single-package project, so a workspace-wide rule would turn the check off there, and in
 * any repo it would silence a second file hand-rolling the idiom instead of importing the local implementation.
 *
 * The definition is read from the file's text, so a detector reporting sites that declare nothing is exempted on the
 * same terms as one reporting a declaration. A file the sweep never read cannot be shown to define anything, and a
 * repo whose workspaces cannot be discovered holds no publishing workspace to be inside.
 */
export function definesOwnImplementation(path: string, ownImplementation: OwnImplementation): boolean {
  const { exportNames, packageName, sources } = ownImplementation;
  if (exportNames.length === 0) return false;

  const publishingDirs = findPublishingWorkspaceDirs(packageName);
  const inPublishingWorkspace = publishingDirs.some((dir) => containsPath(dir, path));
  if (!inPublishingWorkspace) return false;

  const source = sources.find((candidate) => candidate.path === path);
  if (source === undefined) return false;

  return definesAnyExport(blankNonCode(source.text), exportNames);
}

// region | Helpers

/** Reports whether a workspace directory contains a path, both being relative to the same `cwd`. */
function containsPath(dir: string, path: string): boolean {
  if (dir === '.') return true;
  return path === dir || path.startsWith(`${dir}/`);
}

/**
 * Reports whether blanked source exports any of the names.
 *
 * Two forms count: a declaration the `export` keyword introduces, and an export clause naming the binding, whether it
 * was declared under that name or renamed to it. The export is what separates the package's implementation from a
 * second file in it declaring a private helper of the same name, which is a hand-roll the check exists to report. A
 * clause exporting the name under a different one exports something else, and matches neither pattern.
 */
function definesAnyExport(code: string, exportNames: readonly string[]): boolean {
  const names = exportNames.map((name) => RegExp.escape(name)).join('|');
  const exportedDeclaration = new RegExp(
    String.raw`\bexport\s+(?:default\s+)?(?:async\s+)?(?:function[\s*]+|const\s+|let\s+|var\s+|class\s+)(?:${names})\b`,
  );
  const exportClause = new RegExp(String.raw`\bexport\s*\{[^}]*\b(?:${names})\s*(?:,|\})`);

  return exportedDeclaration.test(code) || exportClause.test(code);
}

/**
 * Names the directories of the workspaces publishing the package.
 *
 * Discovery answers best effort here: a repo it cannot read reports as one holding no such workspace, so a check that
 * worked before the rule existed keeps working rather than erroring out of it. The match is on the declared name
 * alone, because what the rule needs is a repo holding the implementation, not one publishing it to a registry.
 */
function findPublishingWorkspaceDirs(packageName: string): string[] {
  try {
    return discoverWorkspaces({ filter: (workspace) => workspace.name === packageName }).map(
      (workspace) => workspace.dir,
    );
  } catch {
    return [];
  }
}

// endregion | Helpers
