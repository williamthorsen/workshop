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
    streams.stderr.write(`${PREFIX} the workspace at ${listing.root} has no packages (${listing.cause})\n`);
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

/** Returns the width to which table lines are cut: none off a terminal, and at most 120 columns on one. */
function resolveMaxWidth(effects: ListPackagesEffects): number | undefined {
  if (!effects.isStdoutTty()) return undefined;

  return Math.min(MAX_TABLE_WIDTH, effects.stdoutColumns() ?? MAX_TABLE_WIDTH);
}

// endregion | Helpers
