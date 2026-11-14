import process from 'node:process';

import { defineCommand, defineGroup, runCli, UsageError } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { OverlayError } from '../errors/OverlayError.ts';
import type { OverlayMode } from '../modes/types.ts';
import { overlay } from '../overlay.ts';
import { formatReport } from '../reporting/formatReport.ts';

const EXIT_HARD_ERROR = 2;

const OPERANDS = [
  { name: 'source-dir', description: 'chezmoi source directory describing the files the target should have' },
  {
    name: 'target-dir',
    description: 'Directory to converge (default: the current working directory)',
    optional: true,
  },
] as const;

const FLAGS = {
  json: { type: 'boolean', description: 'Print the structured result as JSON instead of the text report' },
} as const;

const ROOT = defineGroup({
  summary: 'Overlay a chezmoi source tree onto a target directory',
  epilog: `Examples:
  overlay verify ./templates           Report drift in the current directory
  overlay create ./templates ../app    Add what ../app lacks, leaving differing files alone
  overlay force ./templates --json     Converge fully and print the result as JSON

Exit codes:
  0  Converged / clean
  1  Drift (verify), unresolved conflicts (create), or an internal error in overlay
  2  Hard error: chezmoi missing or below the minimum version, a script failed, or
     invalid arguments`,
  commands: {
    verify: defineModeCommand(
      'verify',
      'Report drift without changing anything',
      `Read-only. Report drift (missing, differing, or to-be-removed files) and exit 1 if any exists. Pending run_
scripts are reported but never affect the verdict: verify confirms file convergence, not script execution.`,
    ),
    create: defineModeCommand(
      'create',
      'Add what is missing, leaving differing files untouched',
      `Create missing files, perform native removals, run run_ scripts, and report differing files as conflicts
without overwriting them.`,
    ),
    force: defineModeCommand(
      'force',
      'Converge fully, overwriting differing files',
      'Full convergence: overwrite differing files, perform removals, and run run_ scripts.',
    ),
  },
});

/**
 * Runs the overlay CLI for the given argv and returns the process exit code.
 *
 * Writes help, the version, or the run result (text report, or JSON under `--json`) to stdout. A usage error or an
 * `OverlayError` goes to stderr as `overlay: <message>` with exit 2, under `--json` as well. Any other error propagates
 * to the crash handler that the bin entrypoint installs. Never calls `process.exit`: The bin entrypoint owns that.
 */
export async function run(argv: readonly string[], effects: RunEffects): Promise<number> {
  return runCli(argv, ROOT, {
    name: 'overlay',
    version: () => resolveVersion(effects),
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

/** The effects deferred to the entry point, which keeps the runner free of package lookups. */
export interface RunEffects {
  readonly resolveVersion: () => string;
}

// region | Helpers

/** Defines the command that runs overlay in one mode. */
function defineModeCommand(mode: OverlayMode, summary: string, description: string) {
  return defineCommand({
    summary,
    description,
    flags: FLAGS,
    operands: OPERANDS,
    run: async ({ flags, operands, stdout, stderr }) => {
      try {
        const result = await overlay({
          source: operands['source-dir'],
          mode,
          output: process.stderr,
          ...(operands['target-dir'] !== undefined && { target: operands['target-dir'] }),
        });
        stdout.write(flags.json ? `${JSON.stringify(result)}\n` : `${formatReport(result)}\n`);
        return result.exitCode;
      } catch (error: unknown) {
        // A hard error is reported without runCli's pointer to help, which would misread it as a usage mistake.
        if (!(error instanceof OverlayError)) throw error;
        stderr.write(`overlay: ${error.message}\n`);
        return EXIT_HARD_ERROR;
      }
    },
  });
}

/** Resolves the installed version, reporting a failure as a usage error, which exits 2. */
function resolveVersion(effects: RunEffects): string {
  try {
    return effects.resolveVersion();
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

// endregion | Helpers
