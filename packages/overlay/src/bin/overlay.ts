/* eslint n/hashbang: off, n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */

import process from 'node:process';

import { formatJsonError } from '../formatJsonError.ts';
import { formatReport } from '../formatReport.ts';
import { overlay } from '../overlay.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { parseArgs } from './parseArgs.ts';

const HELP = `overlay — overlay a chezmoi source tree onto a target directory

Usage:
  overlay <source-dir> [target-dir] [--verify|--create|--force] [--json] [--help]

Arguments:
  <source-dir>   chezmoi source directory describing the files the target should have.
  [target-dir]   Directory to converge (default: current working directory).

Modes (mutually exclusive; default --verify):
  --verify   Read-only. Report drift (missing, differing, or to-be-removed files)
             and exit non-zero if any exists. Pending run_ scripts are surfaced
             but never affect the verdict; verify confirms file convergence, not
             script execution.
  --create   Create missing files, perform native removals, run run_ scripts, and
             report differing files as conflicts without overwriting them.
  --force    Full convergence: overwrite differing files, perform removals, run
             run_ scripts.

Options:
  --json     Print the structured result as JSON instead of the text report.
  -h, --help Show this help.

Exit codes:
  0  Converged / clean.
  1  Drift (verify) or unresolved conflicts (create).
  2  Hard error: chezmoi missing or below the minimum version, or a script failed.
`;

let exitCode: number;
try {
  const command = parseArgs(process.argv.slice(2));
  if (command.kind === 'help') {
    process.stdout.write(HELP);
    exitCode = 0;
  } else {
    const result = await overlay({
      source: command.source,
      mode: command.mode,
      ...(command.target === undefined ? {} : { target: command.target }),
    });
    if (command.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      process.stdout.write(`${formatReport(result)}\n`);
    }
    exitCode = result.exitCode;
  }
} catch (error: unknown) {
  const message = extractMessage(error);
  process.stderr.write(`${formatJsonError(message)}\n`);
  exitCode = 2;
}
process.exit(exitCode);
