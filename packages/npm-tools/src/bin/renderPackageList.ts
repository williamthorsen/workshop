import path from 'node:path';

import type { EmptyWorkspaceCause } from '@williamthorsen/nmr-core/workspace';
import { measureWidth, truncateToWidth } from '@williamthorsen/toolbelt.terminal/candidate';

import type { WorkspaceListing, WorkspacePackage } from '../workspace/listWorkspacePackages.ts';
import { EXIT_FAILED, EXIT_OK, type RenderedOutput } from './exitCodes.ts';

const HEADER = ['PUBLISH', 'NAME', 'VERSION', 'DIRECTORY', 'DESCRIPTION'];
const PREFIX = 'thor-npm list-packages:';

/**
 * Renders the outcome of `list-packages` for the workspace listing of `cwd`: the packages on stdout, as a table
 * or, under `json`, as JSON, and on stderr why a workspace has no packages or cannot be listed. A table line is cut to
 * `maxWidth` when that is set.
 *
 * @internal
 */
export function renderListPackages(
  listing: WorkspaceListing,
  options: { readonly cwd: string; readonly json: boolean; readonly maxWidth?: number | undefined },
): RenderedOutput {
  if (listing.kind === 'not-a-workspace') {
    return failWith(
      `${PREFIX} no pnpm-workspace.yaml found in ${options.cwd} or any parent directory; run it from inside a pnpm workspace\n`,
    );
  }
  if (listing.kind === 'unreadable-package-manifest') {
    return failWith(`thor-npm: could not read ${listing.manifestPath}: ${listing.reason}\n`);
  }

  let stderr = '';
  if (listing.kind === 'empty') {
    const { isBroken, reason } = describeEmptyWorkspace(listing.cause, listing.patterns, listing.root);
    if (isBroken) return failWith(`${PREFIX} ${reason}; fix it, then run this again\n`);
    stderr = `${PREFIX} the workspace at ${listing.root} has no packages: ${reason}\n`;
  }

  const packages = listing.kind === 'packages' ? listing.packages : [];
  const stdout = options.json
    ? renderPackageJson(packages)
    : renderPackageTable(packages, { maxWidth: options.maxWidth });
  return { exitCode: EXIT_OK, stderr, stdout };
}

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

/**
 * Explains why a workspace resolves to no packages, quoting the patterns that its manifest declares. A manifest that
 * cannot be read is broken rather than empty.
 */
function describeEmptyWorkspace(
  cause: EmptyWorkspaceCause,
  patterns: readonly string[],
  root: string,
): { readonly isBroken: boolean; readonly reason: string } {
  const manifestPath = path.join(root, 'pnpm-workspace.yaml');
  const quoted = patterns.map((pattern) => `'${pattern}'`).join(', ');
  switch (cause) {
    case 'all-excluded':
      return { isBroken: false, reason: `its exclusions remove every package that its patterns ${quoted} match` };
    case 'no-package':
      return { isBroken: false, reason: `its patterns ${quoted} do not match any directory containing a package.json` };
    case 'no-packages-list':
      return { isBroken: false, reason: 'pnpm-workspace.yaml does not declare a packages list' };
    case 'no-pattern':
      return {
        isBroken: false,
        reason: `its packages list ${quoted} does not contain a pattern that includes directories`,
      };
    case 'unreadable-manifest':
      return { isBroken: true, reason: `${manifestPath} cannot be read or parsed as YAML` };
    case 'unreadable-packages':
      return { isBroken: true, reason: `the packages value in ${manifestPath} is not a list of strings` };
  }
}

/** Returns a failure that writes one line to stderr and nothing to stdout. */
function failWith(stderr: string): RenderedOutput {
  return { exitCode: EXIT_FAILED, stderr, stdout: '' };
}

/** Returns `<parent>/` when every directory is a child of the same parent, and an empty string otherwise. */
function findSharedParentPrefix(directories: readonly string[]): string {
  const parents = new Set(directories.map((directory) => directory.slice(0, directory.lastIndexOf('/') + 1)));
  const [parent] = parents;

  return parents.size === 1 && parent !== undefined ? parent : '';
}

// endregion | Helpers
