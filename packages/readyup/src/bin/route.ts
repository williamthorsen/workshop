import process from 'node:process';

import { parseRunArgs, resolveKitSources, runCommand } from '../cli.ts';
import { compileCommand } from '../compile/compileCommand.ts';
import { initCommand } from '../init/initCommand.ts';
import { listCommand } from '../list/listCommand.ts';
import { loadConfig } from '../loadConfig.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { verifyCommand } from '../verify/verifyCommand.ts';
import { VERSION } from '../version.ts';

const SUBCOMMANDS = ['compile', 'init', 'list', 'verify'];
const MIN_PREFIX_LENGTH = 3;

function showHelp(): void {
  console.info(`
Usage: rdy [kit[:checklist,...] ...] [options]
       rdy <command> [options]

Commands:
  run [kit[:checklist,...] ...]  Run rdy checklists (default)
  compile [file]                Bundle TypeScript kit(s) into self-contained ESM file(s)
  init                          Scaffold a starter config and kit
  list                          List available kits
  verify                        Check compiled kits against manifest hashes

Run options:
  --from <source>                    Kit source (github:org/repo, bitbucket:ws/repo, global, dir:path, or local path)
  --file, -f <path>                  Path to a local kit file
  --url, -u <url>                    Fetch kit from a URL
  --jit, -J                          Run from TypeScript source instead of compiled JS
  --internal, -i                     Use internal kit directory and infix from config
  --checklists, -c <name,...>        Filter checklists (with --file or --url only)
  --json, -j                         Output results as JSON
  --fail-on, -F <severity>           Fail on this severity or above (error, warn, recommend)
  --report-on, -R <severity>         Report this severity or above (error, warn, recommend)

Global options:
  --help, -h           Show this help message
  --version, -V        Show version number
`);
}

function showRunHelp(): void {
  console.info(`
Usage: rdy run [kit[:checklist,...] ...] [options]

Run rdy checklists. Positional arguments select kits to run; use colon syntax
to filter checklists within a kit (e.g., deploy:check1,check2).
If no arguments are given, all checklists in the default kit are run.

Kit source (mutually exclusive):
  --from <source>                    Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref],
                                     global, dir:path, or local repo path)
  --file, -f <path>                  Path to a local kit file
  --url, -u <url>                    Fetch kit from a URL

Mode flags (incompatible with --from, --file, --url):
  --jit, -J                          Run from TypeScript source instead of compiled JS
  --internal, -i                     Use internal kit directory and infix from config

Options:
  --checklists, -c <name,...>        Filter checklists (with --file or --url only)
  --json, -j                         Output results as JSON
  --fail-on, -F <severity>           Fail on this severity or above (error, warn, recommend)
  --report-on, -R <severity>         Report this severity or above (error, warn, recommend)
  --help, -h                         Show this help message

Positional args accept relative paths (e.g., shared/deploy).
Defaults to .readyup/kits/default.js when no source is given.
`);
}

function showCompileHelp(): void {
  console.info(`
Usage: rdy compile [<file>] [options]

Bundle TypeScript kit(s) into self-contained ESM bundle(s).
If no file is given, all sources from the config's srcDir are compiled.

Modes:
  rdy compile                  Compile all sources from the config's srcDir
  rdy compile <file>           Compile a single file

Options:
  --output, -o <path>  Output file path (single-file mode only)
  --manifest <path>    Manifest file path (default: .readyup/manifest.json)
  --force              Overwrite compiled kits even if they have drifted from the manifest
  --skip-manifest      Do not read or write the manifest
  --help, -h           Show this help message

Drift detection:
  rdy compile refuses to overwrite a compiled kit whose on-disk hash differs from the
  manifest's recorded targetHash (e.g. someone edited the compiled file directly).
  Drifted kits are reported and skipped; use --force to overwrite anyway.
`);
}

function showVerifyHelp(): void {
  console.info(`
Usage: rdy verify [options]

Check compiled kits against the hashes recorded in the manifest.

Each kit is reported as one of:
  ok          on-disk hash matches the manifest's targetHash
  drift       on-disk hash differs from the manifest's targetHash
  missing     compiled file is absent
  unverified  manifest entry has no targetHash (predates the feature)

Exits non-zero when any kit is in drift or missing; unverified kits do not fail.

Options:
  --manifest <path>  Manifest file path (default: .readyup/manifest.json)
  --help, -h         Show this help message
`);
}

function showListHelp(): void {
  console.info(`
Usage: rdy list [options]

List available kits without running them.

Modes:
  rdy list                                  List internal and compiled kits (owner view)
  rdy list --from <path>                    List compiled kits at a local path (consumer view)
  rdy list --from global                    List compiled kits in the global directory
  rdy list --from dir:<path>                List kits in an arbitrary directory
  rdy list --from github:org/repo[@ref]     List kits in a remote GitHub repository
  rdy list --from bitbucket:ws/repo[@ref]   List kits in a remote Bitbucket repository

Options:
  --from <source>  Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref], global, dir:path, or local path)
  --help, -h       Show this help message

Examples:
  rdy list                                         Show kits in the current project
  rdy list --from .                                Show compiled kits in the current directory
  rdy list --from global                           Show kits in the global directory
  rdy list --from github:williamthorsen/workshop   Show kits in a remote GitHub repository
  rdy list --from bitbucket:tutorials/markdowndemo Show kits in a remote Bitbucket repository
`);
}

function showInitHelp(): void {
  console.info(`
Usage: rdy init [options]

Scaffold a starter config and kit file.

Options:
  --dry-run, -n   Preview changes without writing files
  --force, -f     Overwrite existing files
  --help, -h      Show this help message
`);
}

/** Check whether a positional arg is a close prefix of a known subcommand. */
function findTypoMatch(input: string): string | undefined {
  if (input.length < MIN_PREFIX_LENGTH || input.startsWith('-')) {
    return undefined;
  }
  for (const cmd of SUBCOMMANDS) {
    if (cmd !== input && cmd.startsWith(input)) {
      return cmd;
    }
  }
  return undefined;
}

/**
 * Route CLI arguments to the appropriate subcommand.
 *
 * Returns a numeric exit code: 0 for success, 1 for errors.
 */
export async function routeCommand(args: string[]): Promise<number> {
  const command = args[0];

  if (command === undefined || command === '--help' || command === '-h') {
    showHelp();
    return 0;
  }

  if (command === '--version' || command === '-V') {
    console.info(VERSION);
    return 0;
  }

  if (command === 'run') {
    return handleRun(args.slice(1));
  }

  if (command === 'compile') {
    const flags = args.slice(1);
    if (flags.some((f) => f === '--help' || f === '-h')) {
      showCompileHelp();
      return 0;
    }
    try {
      return await compileCommand(flags);
    } catch (error: unknown) {
      process.stderr.write(`Error: ${extractMessage(error)}\n`);
      return 1;
    }
  }

  if (command === 'init') {
    const flags = args.slice(1);
    if (flags.some((f) => f === '--help' || f === '-h')) {
      showInitHelp();
      return 0;
    }

    const initFlagSchema = {
      dryRun: { long: '--dry-run', type: 'boolean' as const, short: '-n' },
      force: { long: '--force', type: 'boolean' as const, short: '-f' },
    };

    let parsed;
    try {
      parsed = parseArgs(flags, initFlagSchema);
    } catch (error: unknown) {
      process.stderr.write(`Error: ${translateParseError(error)}\n`);
      return 1;
    }

    return initCommand({ dryRun: parsed.flags.dryRun, force: parsed.flags.force });
  }

  if (command === 'list') {
    const flags = args.slice(1);
    if (flags.some((f) => f === '--help' || f === '-h')) {
      showListHelp();
      return 0;
    }
    try {
      return await listCommand(flags);
    } catch (error: unknown) {
      process.stderr.write(`Error: ${extractMessage(error)}\n`);
      return 1;
    }
  }

  if (command === 'verify') {
    const flags = args.slice(1);
    if (flags.some((f) => f === '--help' || f === '-h')) {
      showVerifyHelp();
      return 0;
    }
    try {
      return verifyCommand(flags);
    } catch (error: unknown) {
      process.stderr.write(`Error: ${extractMessage(error)}\n`);
      return 1;
    }
  }

  // Check for typos before falling through to the default command
  const typoMatch = findTypoMatch(command);
  if (typoMatch !== undefined) {
    process.stderr.write(`Error: Unknown command '${command}'. Did you mean 'rdy ${typoMatch}'?\n`);
    return 1;
  }

  // Default: treat all args as `run` arguments
  return handleRun(args);
}

/** Parse and execute the `run` subcommand. */
async function handleRun(flags: string[]): Promise<number> {
  if (flags.some((f) => f === '--help' || f === '-h')) {
    showRunHelp();
    return 0;
  }

  let parsed: ReturnType<typeof parseRunArgs>;
  try {
    parsed = parseRunArgs(flags);
  } catch (error: unknown) {
    process.stderr.write(`Error: ${extractMessage(error)}\n`);
    return 1;
  }

  // Skip config when an external source flag is active — external modes don't use config values.
  const hasExternalSource =
    parsed.filePath !== undefined || parsed.fromValue !== undefined || parsed.urlValue !== undefined;

  let configFields: { internalDir: string; internalInfix: string | undefined } | undefined;
  if (!hasExternalSource) {
    let config;
    try {
      config = await loadConfig();
    } catch (error: unknown) {
      process.stderr.write(`Error: ${extractMessage(error)}\n`);
      return 1;
    }
    configFields = { internalDir: config.internal.dir, internalInfix: config.internal.infix };
  }

  let kitEntries;
  try {
    kitEntries = resolveKitSources({
      filePath: parsed.filePath,
      fromValue: parsed.fromValue,
      urlValue: parsed.urlValue,
      kitSpecifiers: parsed.kitSpecifiers,
      checklists: parsed.checklists,
      jit: parsed.jit,
      internal: parsed.internal,
      ...configFields,
    });
  } catch (error: unknown) {
    process.stderr.write(`Error: ${extractMessage(error)}\n`);
    return 1;
  }

  return runCommand(
    {
      kitEntries,
      json: parsed.json,
      ...(parsed.failOn !== undefined && { failOn: parsed.failOn }),
      ...(parsed.reportOn !== undefined && { reportOn: parsed.reportOn }),
    },
    parsed.jit,
  );
}
