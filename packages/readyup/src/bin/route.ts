import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { parseRunArgs, resolveKitSources, runCommand } from '../cli.ts';
import { compileCommand } from '../compile/compileCommand.ts';
import { configError, toRdyError, usageError } from '../errors.ts';
import { EXIT_OK, EXIT_TOOL_FAILURE } from '../exitCodes.ts';
import { formatJsonError } from '../formatJsonError.ts';
import { hasJsonFlag } from '../hasJsonFlag.ts';
import { initCommand } from '../init/initCommand.ts';
import { listCommand } from '../list/listCommand.ts';
import { loadConfig } from '../loadConfig.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import { verifyCommand } from '../verify/verifyCommand.ts';
import { VERSION } from '../version.ts';

const SUBCOMMANDS = ['compile', 'init', 'list', 'verify'];
const MIN_PREFIX_LENGTH = 3;

const HELP = `
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
  --report-on, -R <severity>         Show this severity or above in the detail tree (error, warn, recommend),
                                     plus the parent checks of anything shown; summary counts always
                                     cover the whole run

Global options:
  --help, -h           Show this help message
  --version, -V        Show version number
`;

const RUN_HELP = `
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
  --report-on, -R <severity>         Show this severity or above in the detail tree (error, warn, recommend),
                                     plus the parent checks of anything shown; summary counts always
                                     cover the whole run
  --help, -h                         Show this help message

Positional args accept relative paths (e.g., shared/deploy).
Defaults to .readyup/kits/default.js when no source is given.
`;

const COMPILE_HELP = `
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
`;

const VERIFY_HELP = `
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
`;

const LIST_HELP = `
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
  rdy list --from bitbucket:tutorials/markdowndemo@master Show kits in a remote Bitbucket repository
`;

const INIT_HELP = `
Usage: rdy init [options]

Scaffold a starter config and kit file.

Options:
  --dry-run, -n   Preview changes without writing files
  --force, -f     Overwrite existing files
  --help, -h      Show this help message
`;

/**
 * Route CLI arguments to the appropriate subcommand.
 *
 * Returns a numeric exit code. Every failure that prevents the invocation from completing
 * is rendered here — as prose on stderr, or as the JSON error envelope on stdout when
 * `--json` is in argv — so no command carries its own error-reporting path.
 */
export async function routeCommand(args: string[]): Promise<number> {
  const json = hasJsonFlag(args);
  try {
    return await dispatchCommand(args, json);
  } catch (error: unknown) {
    return reportFailure(error, json);
  }
}

/**
 * Render a failed invocation and return its exit code.
 *
 * Exported so the runner's outer boundary reports a failure that escaped `routeCommand`
 * through the same channel.
 */
export function reportFailure(error: unknown, json: boolean): number {
  const rdyError = toRdyError(error);
  if (json) {
    process.stdout.write(formatJsonError(rdyError) + '\n');
  } else {
    process.stderr.write(`Error: ${rdyError.message}\n`);
  }
  return EXIT_TOOL_FAILURE;
}

/** Select and run the subcommand named by the first argument. */
async function dispatchCommand(args: string[], json: boolean): Promise<number> {
  const command = args[0];

  if (command === undefined || command === '--help' || command === '-h') {
    return writeHelp(HELP, json);
  }

  if (command === '--version' || command === '-V') {
    writeHuman(`${VERSION}\n`, json);
    return EXIT_OK;
  }

  if (command === 'run') {
    return handleRun(args.slice(1), json);
  }

  if (command === 'compile') {
    const flags = args.slice(1);
    return wantsHelp(flags) ? writeHelp(COMPILE_HELP, json) : compileCommand(flags);
  }

  if (command === 'init') {
    const flags = args.slice(1);
    return wantsHelp(flags) ? writeHelp(INIT_HELP, json) : handleInit(flags);
  }

  if (command === 'list') {
    const flags = args.slice(1);
    return wantsHelp(flags) ? writeHelp(LIST_HELP, json) : listCommand(flags);
  }

  if (command === 'verify') {
    const flags = args.slice(1);
    return wantsHelp(flags) ? writeHelp(VERIFY_HELP, json) : verifyCommand(flags);
  }

  // Check for typos before falling through to the default command.
  const typoMatch = findTypoMatch(command);
  if (typoMatch !== undefined) {
    throw usageError(`Unknown command '${command}'. Did you mean 'rdy ${typoMatch}'?`);
  }

  // Default: treat all args as `run` arguments.
  return handleRun(args, json);
}

/** Parse and execute the `run` subcommand. */
async function handleRun(flags: string[], json: boolean): Promise<number> {
  if (wantsHelp(flags)) return writeHelp(RUN_HELP, json);

  const parsed = parseRunArgs(flags);

  // Skip config when an external source flag is active — external modes don't use config values.
  const hasExternalSource =
    parsed.filePath !== undefined || parsed.fromValue !== undefined || parsed.urlValue !== undefined;

  let configFields: { internalDir: string; internalInfix: string | undefined } | undefined;
  if (!hasExternalSource) {
    let config;
    try {
      config = await loadConfig();
    } catch (error: unknown) {
      throw configError(toRdyError(error).message, { cause: error });
    }
    configFields = { internalDir: config.internal.dir, internalInfix: config.internal.infix };
  }

  const kitEntries = resolveKitSources({
    filePath: parsed.filePath,
    fromValue: parsed.fromValue,
    urlValue: parsed.urlValue,
    kitSpecifiers: parsed.kitSpecifiers,
    checklists: parsed.checklists,
    jit: parsed.jit,
    internal: parsed.internal,
    ...configFields,
  });

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

/** Parse and execute the `init` subcommand. */
function handleInit(flags: string[]): number {
  const initOptions = {
    'dry-run': { type: 'boolean', short: 'n' },
    force: { type: 'boolean', short: 'f' },
  } as const;

  let parsed;
  try {
    parsed = nodeParseArgs({ args: flags, options: initOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error), { cause: error });
  }

  return initCommand({ dryRun: parsed.values['dry-run'] === true, force: parsed.values.force === true });
}

/** Return true when the flags request help for the current subcommand. */
function wantsHelp(flags: string[]): boolean {
  return flags.some((f) => f === '--help' || f === '-h');
}

/** Emit help text through the human channel and report success. */
function writeHelp(text: string, json: boolean): number {
  writeHuman(`${text}\n`, json);
  return EXIT_OK;
}

/** Write human-readable prose, diverting it to stderr when JSON mode owns stdout. */
function writeHuman(text: string, json: boolean): void {
  const stream = json ? process.stderr : process.stdout;
  stream.write(text);
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
