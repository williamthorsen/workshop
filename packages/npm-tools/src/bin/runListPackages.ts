import path from 'node:path';

import type { EmptyWorkspaceCause } from '@williamthorsen/nmr-core/workspace';
import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { listWorkspacePackages } from '../workspace/listWorkspacePackages.ts';
import { renderPackageJson, renderPackageTable } from './renderPackageList.ts';

const EXIT_FAILED = 1;
const EXIT_OK = 0;
const MAX_TABLE_WIDTH = 120;
const PREFIX = 'thor-npm list-packages:';

/**
 * Prints the packages of the pnpm workspace that contains the working directory, as a table or, under `json`, as
 * JSON. On a terminal, each table line is cut to fit. Returns the exit code.
 *
 * @internal
 */
export function runListPackages(
  options: ListPackagesOptions,
  effects: ListPackagesEffects,
  streams: { readonly stderr: Writer; readonly stdout: Writer },
): number {
  const cwd = effects.cwd();
  const listing = listWorkspacePackages(cwd);

  if (listing.kind === 'not-a-workspace') {
    streams.stderr.write(
      `${PREFIX} no pnpm-workspace.yaml found in ${cwd} or any parent directory; run it from inside a pnpm workspace\n`,
    );
    return EXIT_FAILED;
  }
  if (listing.kind === 'empty') {
    const { isBroken, reason } = describeEmptyWorkspace(listing.cause, listing.patterns, listing.root);
    if (isBroken) {
      streams.stderr.write(`${PREFIX} ${reason}; fix it, then run this again\n`);
      return EXIT_FAILED;
    }
    streams.stderr.write(`${PREFIX} the workspace at ${listing.root} has no packages: ${reason}\n`);
  }

  const packages = listing.kind === 'packages' ? listing.packages : [];
  streams.stdout.write(
    options.json ? renderPackageJson(packages) : renderPackageTable(packages, { maxWidth: resolveMaxWidth(effects) }),
  );
  return EXIT_OK;
}

/** The effects that listing packages reads from the process. */
export interface ListPackagesEffects {
  readonly cwd: () => string;
  readonly isStdoutTty: () => boolean;
  /** The terminal's width in columns, or `undefined` when stdout does not report one. */
  readonly stdoutColumns: () => number | undefined;
}

/** The options of `list-packages`. */
export interface ListPackagesOptions {
  readonly json: boolean;
}

// region | Helpers

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

/** Returns the width to which table lines are cut: none off a terminal, and at most 120 columns on one. */
function resolveMaxWidth(effects: ListPackagesEffects): number | undefined {
  if (!effects.isStdoutTty()) return undefined;

  return Math.min(MAX_TABLE_WIDTH, effects.stdoutColumns() ?? MAX_TABLE_WIDTH);
}

// endregion | Helpers
