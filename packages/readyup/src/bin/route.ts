import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { parseRunArgs, resolveKitSources, runCommand } from '../cli.ts';
import { compileCommand } from '../compile/compileCommand.ts';
import { configError, toRdyError, usageError } from '../errors.ts';
import { EXIT_OK, EXIT_TOOL_FAILURE } from '../exitCodes.ts';
import { formatJsonError } from '../formatJsonError.ts';
import { hasJsonFlag } from '../hasJsonFlag.ts';
import { initCommand } from '../init/initCommand.ts';
import { KITS_DIR } from '../kitsDir.ts';
import { listCommand } from '../list/listCommand.ts';
import { loadConfig } from '../loadConfig.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import { verifyCommand } from '../verify/verifyCommand.ts';
import { VERSION } from '../version.ts';
import { writeHuman } from '../writeHuman.ts';

/** Command names a mistyped bare word is matched against, including the implicit `run`. */
const COMMAND_NAMES = ['compile', 'init', 'list', 'run', 'verify'];

/** Edits — insertions, deletions, or substitutions — a word may be from a command and still match it. */
const MAX_TYPO_DISTANCE = 2;

/** Extensions a kit file can carry, in the order `run` would resolve them. */
const KIT_EXTENSIONS = ['.js', '.ts'];

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
  --url <url>                        Fetch kit from a URL
  --jit                              Run from TypeScript source instead of compiled JS
  --internal                         Use internal kit directory and infix from config
  --checklists, -c <name,...>        Filter checklists within the selected kit
  --json                             Output results as JSON
  --detail <summary|full>            How much of the JSON report to emit (default: full); requires --json
  --fail-on <severity>               Fail on this severity or above (error, warn, recommend)
  --report-on <severity>             Show this severity or above in the detail tree (error, warn, recommend),
                                     plus the parent checks of anything shown; summary counts always
                                     cover the whole run

Global options:
  --help, -h           Show this help message
  --version, -V        Show version number

Exit codes:
  0  Ran and found no problems
  1  Ran and found problems with the repo or its kits
  2  Could not complete the invocation (usage, config, kit-load, or internal error)

  list and init use only 0 and 2; neither can find problems to report.

run, compile, list, and verify accept --json; init does not, since scaffolding is
interactive. With --json, stdout carries exactly one JSON document and all prose goes to
stderr. For run that document is the report when a run produced one, otherwise the error
envelope {"schemaVersion", "error": {"code", "message"}}. --help and --version have no
JSON form: their text goes to stderr and stdout stays empty.

Every payload carries an integer schemaVersion and is specified by a JSON Schema shipped
with the package, importable as readyup/schemas/<name>.v1.json. Adding an optional field
does not bump a payload's schemaVersion; removing, renaming, or re-typing one does.
Warning codes are an open set, so a new advisory never bumps the version and a consumer
must tolerate a code it does not recognize.

In the report, failOn and reportOn appear at the top level only when the matching flag was
given, naming what the invocation requested. Each kit that ran carries the thresholds that
governed it, so a kit declaring its own is readable from its entry rather than inferred.

A kit that fails once the run has reached its kits does not discard the kits that ran.
Under --json it becomes a kits entry carrying "error" in place of results; otherwise it
is reported on stderr, prefixed with the kit's name when more than one kit was
requested. Either way the run continues and exits 2.
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
  --url <url>                        Fetch kit from a URL

Mode flags (incompatible with --from, --file, --url):
  --jit                              Run from TypeScript source instead of compiled JS
  --internal                         Use internal kit directory and infix from config

Options:
  --checklists, -c <name,...>        Filter checklists within the selected kit; requires a
                                     single kit and no ":" filter on it
  --json                             Output results as JSON
  --detail <summary|full>            How much of the JSON report to emit (default: full); requires --json.
                                     "summary" drops the detail tree to the failed checks and their fixes,
                                     keeping counts, verdicts, and worst severity intact
  --fail-on <severity>               Fail on this severity or above (error, warn, recommend)
  --report-on <severity>             Show this severity or above in the detail tree (error, warn, recommend),
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
  --json               Report each kit's status as JSON
  --skip-manifest      Do not read or write the manifest
  --help, -h           Show this help message

Drift detection:
  rdy compile refuses to overwrite a compiled kit whose on-disk hash differs from the
  manifest's recorded targetHash (e.g. someone edited the compiled file directly).
  Drifted kits are reported and skipped; use --force to overwrite anyway.

A sweep runs to completion: a kit that fails to compile is reported and the next kit is
tried, so every kit's status is known after one run. A kit that failed is never recorded as
though it had compiled, and one that had compiled before keeps the entry it already had.

Each kit's checklist names are recorded in the manifest so rdy list can report them
without running the kit. The field is optional, so the manifest format stays at version 1.

Exits 1 when a kit fails to compile or is skipped as drifted, and 2 when the config or
manifest cannot be read or written.
`;

const VERIFY_HELP = `
Usage: rdy verify [options]

Check compiled kits against the hashes recorded in the manifest.

Each kit is reported as one of:
  ok          on-disk hash matches the manifest's targetHash
  drift       on-disk hash differs from the manifest's targetHash
  missing     compiled file is absent
  unverified  manifest entry has no targetHash (predates the feature)

Exits 1 when any kit is in drift or missing; unverified kits do not fail. An unreadable
manifest exits 2.

Options:
  --manifest <path>  Manifest file path (default: .readyup/manifest.json)
  --json             Report each kit's verification status as JSON
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
  --from <source>    Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref], global, dir:path, or local path)
  --manifest <path>  List the kits a manifest file declares
  --json             Output the kit list as JSON
  --help, -h         Show this help message

A local --from source with no manifest beside its kits falls back to listing the compiled
kits on disk, which are the same kits rdy run --from would resolve. Those rows carry only
a name and a path; descriptions, checklist names, and versions live in the absent manifest.
A remote source still requires a manifest.

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
  --force         Overwrite existing files
  --help, -h      Show this help message
`;

/**
 * Routes CLI arguments to the appropriate subcommand.
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
 * Renders a failed invocation and returns its exit code.
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

/** Selects and runs the subcommand named by the first argument. */
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

  // A bare word that names a kit is always run as that kit; only one that names none can be a
  // mistyped command. The check sits here rather than in `handleRun` so an explicit `rdy run <word>`
  // never reaches it: naming the subcommand says the word is a kit.
  const typoMatch = findTypoMatch(command);
  if (typoMatch !== undefined && !hasLocalKit(command)) {
    throw usageError(`Unknown command '${command}'. Did you mean 'rdy ${typoMatch}'?`);
  }

  // Default: treat all args as `run` arguments.
  return handleRun(args, json);
}

/** Parses and executes the `run` subcommand. */
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
      throw configError(extractMessage(error), { cause: error });
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
      ...(parsed.detail !== undefined && { detail: parsed.detail }),
      ...(parsed.failOn !== undefined && { failOn: parsed.failOn }),
      ...(parsed.reportOn !== undefined && { reportOn: parsed.reportOn }),
    },
    parsed.jit,
  );
}

/** Parses and executes the `init` subcommand. */
function handleInit(flags: string[]): number {
  const initOptions = {
    'dry-run': { type: 'boolean', short: 'n' },
    force: { type: 'boolean' },
  } as const;

  let parsed;
  try {
    parsed = nodeParseArgs({ args: flags, options: initOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error), { cause: error });
  }

  return initCommand({ dryRun: parsed.values['dry-run'] === true, force: parsed.values.force === true });
}

/** Returns true when the flags request help for the current subcommand. */
function wantsHelp(flags: string[]): boolean {
  return flags.some((f) => f === '--help' || f === '-h');
}

/** Emits help text through the human channel and reports success. */
function writeHelp(text: string, json: boolean): number {
  writeHuman(`${text}\n`, json);
  return EXIT_OK;
}

/**
 * Find the command a bare word most likely misspells, or `undefined` when none is close enough.
 *
 * A word qualifies by abbreviating a command or by sitting within a couple of edits of one, so a
 * transposed or wrong letter is caught alongside a truncation. Ties go to the nearest command and
 * then to the first in alphabetical order. Words starting with `-` are flags, which the argument
 * parser reports on its own.
 */
function findTypoMatch(input: string): string | undefined {
  if (input === '' || input.startsWith('-')) return undefined;

  let best: { command: string; distance: number } | undefined;
  for (const command of COMMAND_NAMES) {
    const distance = measureEditDistance(input, command);
    const isCandidate = distance <= MAX_TYPO_DISTANCE || command.startsWith(input);
    if (isCandidate && (best === undefined || distance < best.distance)) {
      best = { command, distance };
    }
  }
  return best?.command;
}

/**
 * Report whether a bare word names a kit in the conventional kit directory.
 *
 * Only the conventional local paths are probed, so a kit reachable solely through `--from` or an
 * `--internal` directory is invisible here and a near-command name under those sources is still
 * reported as a typo. That invocation was already failing before the check existed.
 */
function hasLocalKit(name: string): boolean {
  return KIT_EXTENSIONS.some((extension) => existsSync(path.join(process.cwd(), KITS_DIR, `${name}${extension}`)));
}

/** Compute the Levenshtein edit distance between two words. */
function measureEditDistance(source: string, target: string): number {
  const targetCharacters = Array.from(target);

  // Each row holds the distance from one prefix of the source to every non-empty prefix of the
  // target. Column zero is held in a scalar rather than the row because its value is always the
  // row's own index, which keeps every read a plain iteration.
  let previousRow = targetCharacters.map((character, index) => ({ character, distance: index + 1 }));

  for (const [rowIndex, sourceCharacter] of Array.from(source).entries()) {
    let diagonal = rowIndex;
    let left = rowIndex + 1;
    const currentRow: typeof previousRow = [];

    for (const { character, distance: above } of previousRow) {
      const substitution = diagonal + (sourceCharacter === character ? 0 : 1);
      const distance = Math.min(above + 1, left + 1, substitution);
      currentRow.push({ character, distance });
      diagonal = above;
      left = distance;
    }

    previousRow = currentRow;
  }

  // An empty target leaves every row empty, and the distance is then the source's length alone.
  return previousRow.at(-1)?.distance ?? source.length;
}
