import { blankNonCode } from '../../portable/blankNonCode.ts';
import { type DeclarationSpan, listDeclarationSpans } from '../../portable/listDeclarationSpans.ts';
import { discoverWorkspaces } from '../workspaces.ts';
import type { ProjectSource } from './readTrackedSources.ts';

// An export clause and, where one follows, the `from` that makes it a re-export. `[^}]*` stops at the first `}`, which
// a clause holds only as its own terminator.
const EXPORT_CLAUSE = /\bexport\s*\{([^}]*)\}\s*(from\b)?/g;
// One clause item: the local binding, optionally renamed on the way out, behind an optional inline `type` modifier.
const CLAUSE_ITEM = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;

/**
 * The package a check is about, the exports whose definition marks a file as its implementation, and the swept
 * sources.
 */
export interface OwnImplementation {
  packageName: string;
  exportNames: readonly string[];
  sources: readonly ProjectSource[];
}

/**
 * Lists the line ranges of a path that hold the declared package's own implementation: each top-level declaration the
 * file exports under one of the package's recommended names, in a file inside the workspace publishing the package.
 *
 * Every narrowing is required. A repo publishing the package is where the idiom is supposed to live, but the workspace
 * is the whole repository wherever the root manifest declares the name, as a single-package project's always does, so a
 * workspace-wide rule would turn the check off there, and in any repo it would silence a second file hand-rolling the
 * idiom instead of importing the local implementation. The argument extends one step further, to the declaration: the
 * reasoning reaches a wrapper of the idiom its own kit detects, which cannot adopt itself, while its neighbours in the
 * same file are ordinary code.
 *
 * The declaration is read from the file's text, so a detector reporting sites that declare nothing is exempted on the
 * same terms as one reporting a declaration. A file the sweep never read cannot be shown to declare anything, and a
 * repo whose workspaces cannot be discovered holds no publishing workspace to be inside; either yields no lines.
 */
export function listOwnImplementationSpans(
  path: string,
  ownImplementation: OwnImplementation,
): readonly DeclarationSpan[] {
  const { exportNames, packageName, sources } = ownImplementation;
  if (exportNames.length === 0) return [];

  const publishingDirs = findPublishingWorkspaceDirs(packageName);
  const inPublishingWorkspace = publishingDirs.some((dir) => containsPath(dir, path));
  if (!inPublishingWorkspace) return [];

  const source = sources.find((candidate) => candidate.path === path);
  if (source === undefined) return [];

  const code = blankNonCode(source.text);
  const localNames = listLocalExportNames(code, exportNames);
  if (localNames.size === 0) return [];

  return listDeclarationSpans(code).filter((span) => localNames.has(span.name));
}

// region | Helpers

/** Reports whether a workspace directory contains a path, both being relative to the same `cwd`. */
function containsPath(dir: string, path: string): boolean {
  if (dir === '.') return true;
  return path === dir || path.startsWith(`${dir}/`);
}

/**
 * Names the directories of the workspaces publishing the package.
 *
 * Discovery is best effort here: a repo it cannot read reports as one holding no such workspace, so a check that
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

/**
 * Names the local bindings that blanked source exports under one of the given names.
 *
 * Two forms count: a declaration the `export` keyword introduces, contributing the name it declares, and an export
 * clause naming the binding, contributing the local name whether the binding was exported bare or renamed on the way
 * out. The export is what separates the package's implementation from a second file in it declaring a private helper
 * of the same name, which is a hand-roll the check exists to report. A clause exporting the name under a different one
 * exports something else, and matches neither pattern.
 *
 * A clause with `from` declares nothing local, so a re-exporting barrel names no binding here and exempts no
 * lines.
 */
function listLocalExportNames(code: string, exportNames: readonly string[]): Set<string> {
  const recommended = new Set(exportNames);
  const localNames = new Set<string>();

  const names = exportNames.map((name) => RegExp.escape(name)).join('|');
  const exportedDeclaration = new RegExp(
    String.raw`\bexport\s+(?:default\s+)?(?:async\s+)?(?:function[\s*]+|const\s+|let\s+|var\s+|class\s+)(${names})\b`,
    'g',
  );
  for (const match of code.matchAll(exportedDeclaration)) {
    if (match[1] !== undefined) localNames.add(match[1]);
  }

  for (const clause of code.matchAll(EXPORT_CLAUSE)) {
    if (clause[2] !== undefined) continue;
    const items = (clause[1] ?? '').split(',');
    for (const item of items) {
      const parsed = CLAUSE_ITEM.exec(item.trim());
      const localName = parsed?.[1];
      if (localName !== undefined && recommended.has(parsed?.[2] ?? localName)) localNames.add(localName);
    }
  }

  return localNames;
}

// endregion | Helpers
