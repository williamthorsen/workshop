import { measureWidth, truncateToWidth } from '@williamthorsen/toolbelt.terminal/candidate';

import type { WorkspacePackage } from '../workspace/listWorkspacePackages.ts';

const HEADER = ['PUBLISH', 'NAME', 'VERSION', 'DIRECTORY', 'DESCRIPTION'];

/**
 * Renders the packages as a JSON document under a `packages` key, each with its full workspace-relative directory.
 *
 * @internal
 */
export function renderPackageJson(packages: readonly WorkspacePackage[]): string {
  const entries = packages.map(({ description, directory, name, private: isPrivate, version }) => ({
    name,
    version,
    private: isPrivate,
    directory,
    description,
  }));

  return `${JSON.stringify({ packages: entries }, null, 2)}\n`;
}

/**
 * Renders a header and one line per package, padding each column to its widest value. A directory leaves out the
 * parent directory that every package shares, when there is one. When `maxWidth` is set, each line is cut to it.
 *
 * @internal
 */
export function renderPackageTable(
  packages: readonly WorkspacePackage[],
  options: { readonly maxWidth?: number | undefined } = {},
): string {
  const { maxWidth } = options;
  const parentPrefix = findSharedParentPrefix(packages.map(({ directory }) => directory));
  const rows = [
    HEADER,
    ...packages.map((pkg) => [
      pkg.private ? 'no' : 'yes',
      pkg.name ?? '',
      pkg.version ?? '',
      pkg.directory.slice(parentPrefix.length),
      collapseLineBreaks(pkg.description ?? ''),
    ]),
  ];
  const widths = HEADER.map((_, column) => Math.max(...rows.map((row) => measureWidth(row[column] ?? ''))));

  return rows
    .map((row) => {
      const line = row
        .map((cell, column) => cell + ' '.repeat((widths[column] ?? 0) - measureWidth(cell)))
        .join('  ')
        .trimEnd();
      return maxWidth === undefined ? line : truncateToWidth(line, { ellipsis: '…', width: maxWidth });
    })
    .map((line) => `${line}\n`)
    .join('');
}

// region | Helpers

/** Joins the lines of a description with single spaces, so that each package stays on one line. */
function collapseLineBreaks(text: string): string {
  return text.replaceAll(/\s*[\r\n]+\s*/g, ' ');
}

/** Returns `<parent>/` when every directory is a child of the same parent, and an empty string otherwise. */
function findSharedParentPrefix(directories: readonly string[]): string {
  const parents = new Set(directories.map((directory) => directory.slice(0, directory.lastIndexOf('/') + 1)));
  const [parent] = parents;

  return parents.size === 1 && parent !== undefined ? parent : '';
}

// endregion | Helpers
