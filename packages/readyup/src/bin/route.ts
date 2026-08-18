import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { compileCommand } from '../compile/compileCommand.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, toRdyError, usageError } from '../errors/RdyError.ts';
import { initCommand } from '../init/initCommand.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { getLayout, setStyle } from '../layout/engine.ts';
import { describeInvalidStyle, resolveStyle, STYLE_FLAG } from '../layout/resolveStyle.ts';
import { listCommand } from '../list/listCommand.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { formatJsonError } from '../reporting/formatJsonError.ts';
import { parseRunArgs } from '../run/parseRunArgs.ts';
import { resolveKitSources } from '../run/resolveKitSources.ts';
import { runCommand } from '../run/runCommand.ts';
import { verifyCommand } from '../verify/verifyCommand.ts';
import { VERSION } from '../version.ts';
import { EXIT_OK, EXIT_TOOL_FAILURE } from './exitCodes.ts';
import { findNearestWord } from './findNearestWord.ts';
import { hasJsonFlag } from './hasJsonFlag.ts';

/** Command names a mistyped bare word is matched against, including the implicit `run`. */
const COMMAND_NAMES = ['compile', 'init', 'list', 'run', 'verify'];

/** Flags that request help, whether given as the command itself or among a subcommand's flags. */
const HELP_FLAGS = new Set(['--help', '-h']);

/** Extensions a kit file can carry, in the order `run` would resolve them. */
const KIT_EXTENSIONS = ['.js', '.ts'];

/** Flags naming where a kit comes from, each of which resolves it somewhere the local probe cannot see. */
const SOURCE_FLAGS = new Set(['--file', '-f', '--from', '--internal', '--url']);

/**
 * Where help output sends a reader for anything it does not cover.
 *
 * Help lists the surface; the README explains it, and the skill carries the authoring judgment neither states. The
 * installed path leads because a reader in a consuming repo can open it without a fetch; the repository URL follows
 * for a global install, where no such path exists.
 */
export const DOCS_POINTER = `Full documentation: node_modules/readyup/README.md
   Online: https://github.com/williamthorsen/workshop/tree/main/packages/readyup#readme
Authoring kits: the consult-readyup-kits skill`;

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
  --from <source>                    Kit source (github:org/repo, bitbucket:ws/repo, npm:package, global, dir:path, or local path)
  --file, -f <path>                  Path to a local kit file
  --url <url>                        Fetch kit from a URL
  --packages [<name>]                Run a kit the config's "packages" list publishes (default: "default")
  --jit                              Run from TypeScript source instead of compiled JS
  --internal                         Use internal kit directory and infix from config
  --checklists, -c <name,...>        Filter checklists within the selected kit
  --json                             Output results as JSON
  --detail <summary|full>            How much of the JSON report to emit (default: full); requires --json
  --diagnose                         Report skipped checks whose check would have passed
  --fail-on <severity>               Fail on this severity or above (error, warn, recommend)
  --quiet                            Hide passed checks from the report; incompatible with --json
  --report-on <severity>             Show this severity or above (error, warn, recommend)

Global options:
  --style <auto|plain|rich>  Output style: emoji, ASCII words, or detected (default: auto)
  --help, -h                 Show this help message
  --version, -V              Show version number

Run 'rdy <command> --help' for command-specific options.

Examples:
  rdy                                              Run every checklist in the default kit
  rdy deploy                                       Run the compiled deploy kit
  rdy deploy:build,test                            Run two checklists from the deploy kit
  rdy run --jit deploy                             Run the deploy kit from its TypeScript source
  rdy init                                         Scaffold a starter config and kit
  rdy compile                                      Compile every kit source into a bundle
  rdy list --from github:williamthorsen/workshop   List kits published by a repository

${DOCS_POINTER}
`;

const RUN_HELP = `
Usage: rdy run [kit[:checklist,...] ...] [options]

Run rdy checklists. Positional arguments select kits to run; use colon syntax
to filter checklists within a kit (e.g., deploy:check1,check2).
If no arguments are given, all checklists in the default kit are run.

Kit source (mutually exclusive):
  --from <source>                    Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref],
                                     npm:package, global, dir:path, or local repo path)
  --file, -f <path>                  Path to a local kit file
  --url <url>                        Fetch kit from a URL
  --packages [<name>]                Run a kit from every package the config's "packages"
                                     list names that publishes it, skipping those that do
                                     not; without a name, the kit named "default"

Mode flags (incompatible with --from, --file, --url, --packages):
  --jit                              Run from TypeScript source instead of compiled JS
  --internal                         Use internal kit directory and infix from config

Options:
  --checklists, -c <name,...>        Filter checklists within the selected kit; requires a
                                     single kit and no ":" filter on it
  --json                             Output results as JSON
  --detail <summary|full>            How much of the JSON report to emit (default: full); requires --json
  --diagnose                         Report skipped checks whose check would have passed
  --fail-on <severity>               Fail on this severity or above (error, warn, recommend)
  --quiet                            Hide passed checks from the report; incompatible with --json
  --report-on <severity>             Show this severity or above (error, warn, recommend)
  --style <auto|plain|rich>          Output style (default: auto)
  --help, -h                         Show this help message

Positional args accept relative paths (e.g., shared/deploy).
Defaults to .readyup/kits/default.js when no source is given.

To pass a positional argument that starts with a '-', place it at the end of the command
after '--', as in: rdy run -- "--odd-kit-name"

Examples:
  rdy run                                Run every checklist in the default kit
  rdy run deploy                         Run the compiled deploy kit
  rdy run deploy:build,test              Run two checklists from the deploy kit
  rdy run --jit deploy                   Run the deploy kit from its TypeScript source
  rdy run --from global deploy           Run the deploy kit from the global directory
  rdy run --fail-on warn                 Fail the run on warnings as well as errors
  rdy run --quiet                        Report only what is not passing
  rdy run --diagnose                     Report skips whose check would have passed
  rdy run --json --detail summary        Emit a JSON report carrying only failed checks

${DOCS_POINTER}
`;

const COMPILE_HELP = `
Usage: rdy compile [<file>] [options]

Bundle TypeScript kit(s) into self-contained ESM bundle(s).
If no file is given, all sources from the config's srcDir are compiled.

Modes:
  rdy compile                  Compile all sources from the config's srcDir
  rdy compile <file>           Compile a single file

Options:
  --output, -o <path>        Output file path (single-file mode only)
  --manifest <path>          Manifest file path (default: .readyup/manifest.json)
  --force                    Overwrite compiled kits even if they have drifted from the manifest
  --json                     Report each kit's status as JSON
  --skip-manifest            Do not read or write the manifest
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

${DOCS_POINTER}
`;

const VERIFY_HELP = `
Usage: rdy verify [options]

Check compiled kits against the hashes recorded in the manifest.

Options:
  --manifest <path>          Manifest file path (default: .readyup/manifest.json)
  --json                     Report each kit's verification status as JSON
  --rebuild                  Also recompile each kit and compare it to the committed bundle;
                             requires esbuild
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

${DOCS_POINTER}
`;

const LIST_HELP = `
Usage: rdy list [options]

List available kits without running them.

Modes:
  rdy list                                  List internal and compiled kits (owner view)
  rdy list --recursive                      List compiled kits in every project below this directory
  rdy list --from <path>                    List compiled kits at a local path (consumer view)
  rdy list --from npm:package               List the kits an installed package publishes
  rdy list --from global                    List compiled kits in the global directory
  rdy list --from dir:<path>                List kits in an arbitrary directory
  rdy list --from github:org/repo[@ref]     List kits in a remote GitHub repository
  rdy list --from bitbucket:ws/repo[@ref]   List kits in a remote Bitbucket repository

Options:
  --from <source>            Kit source (github:org/repo[@ref], bitbucket:ws/repo[@ref], npm:package,
                             global, dir:path, or local path)
  --manifest <path>          List the kits a manifest file declares
  --recursive                List compiled kits in every project below the working directory,
                             grouped by project; not combinable with --from or --manifest
  --json                     Output the kit list as JSON
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

Examples:
  rdy list                                         Show kits in the current project
  rdy list --recursive                             Show compiled kits across the whole repository
  rdy list --from .                                Show compiled kits in the current directory
  rdy list --from global                           Show kits in the global directory
  rdy list --from github:williamthorsen/workshop   Show kits in a remote GitHub repository
  rdy list --from bitbucket:tutorials/markdowndemo@master Show kits in a remote Bitbucket repository

${DOCS_POINTER}
`;

const INIT_HELP = `
Usage: rdy init [options]

Scaffold a starter config and kit file.

Options:
  --dry-run, -n              Preview changes without writing files
  --force                    Overwrite existing files
  --style <auto|plain|rich>  Output style (default: auto)
  --help, -h                 Show this help message

${DOCS_POINTER}
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

  // Binding the style precedes the try because the catch renders through it: a style named in argv has
  // to govern the usage error that argv itself provokes. A value naming no style still yields one to
  // render with, and becomes the error raised inside.
  const { style, invalid } = resolveStyle(args, process.env, process.stdout.isTTY);
  setStyle(style);

  try {
    if (invalid !== undefined) throw usageError(describeInvalidStyle(invalid));
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
    if (rdyError.hint !== undefined) {
      process.stderr.write(getLayout().formatHint(rdyError.hint) + '\n');
    }
  }
  return EXIT_TOOL_FAILURE;
}

/** Selects and runs the subcommand named by the first argument. */
async function dispatchCommand(argv: string[], json: boolean): Promise<number> {
  const args = dropLeadingStyleFlag(argv);
  const command = args[0];

  if (command === undefined || HELP_FLAGS.has(command)) {
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
  const typoMatch = findNearestWord(command, COMMAND_NAMES);
  if (typoMatch !== undefined && !namesAKit(command, args)) {
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
  // `--packages` is not one of them: the config is where the packages it runs are named.
  const hasExternalSource =
    parsed.filePath !== undefined || parsed.fromValue !== undefined || parsed.urlValue !== undefined;

  let configFields:
    { internalDir: string; internalInfix: string | undefined; configuredPackages: string[] } | undefined;
  if (!hasExternalSource) {
    let config;
    try {
      config = await loadConfig();
    } catch (error: unknown) {
      throw configError(describeError(error), { cause: error, hint: extractHint(error) });
    }
    configFields = {
      internalDir: config.internal.dir,
      internalInfix: config.internal.infix,
      configuredPackages: config.packages,
    };
  }

  const kitEntries = resolveKitSources({
    filePath: parsed.filePath,
    fromValue: parsed.fromValue,
    urlValue: parsed.urlValue,
    kitSpecifiers: parsed.kitSpecifiers,
    checklists: parsed.checklists,
    jit: parsed.jit,
    internal: parsed.internal,
    packages: parsed.packages,
    ...configFields,
  });

  return runCommand(
    {
      kitEntries,
      json: parsed.json,
      diagnose: parsed.diagnose,
      quiet: parsed.quiet,
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
    // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
    style: { type: 'string' },
  } as const;

  let parsed;
  try {
    parsed = nodeParseArgs({ args: flags, options: initOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'init'), { cause: error });
  }

  return initCommand({ dryRun: parsed.values['dry-run'] === true, force: parsed.values.force === true });
}

/**
 * Returns `argv` without a leading `--style` and the value it carries.
 *
 * Command selection reads the first argument, so a style named ahead of the command would otherwise be
 * taken for a kit name. `routeCommand` has already read the value, so nothing downstream needs the
 * tokens. Scanning stops at the first argument that is not part of a style flag, which leaves a later
 * occurrence for the subcommand's own parser, and leaves a valueless trailing `--style` for it to
 * reject.
 */
function dropLeadingStyleFlag(argv: string[]): string[] {
  const assignment = `${STYLE_FLAG}=`;
  let index = 0;

  while (index < argv.length) {
    const arg = argv[index];
    if (arg?.startsWith(assignment) === true) index += 1;
    else if (arg === STYLE_FLAG && index + 1 < argv.length) index += 2;
    else break;
  }

  return argv.slice(index);
}

/** Returns true when the flags request help for the current subcommand. */
function wantsHelp(flags: string[]): boolean {
  return flags.some((f) => HELP_FLAGS.has(f));
}

/** Emits help text through the human channel and reports success. */
function writeHelp(text: string, json: boolean): number {
  writeHuman(`${text}\n`, json);
  return EXIT_OK;
}

/**
 * Report whether a bare word is a kit rather than a candidate command typo.
 *
 * A ':' checklist filter and a source flag are both kit syntax that no command uses, so either
 * settles the question outright: under them the word is a kit by construction, and the kit it names
 * lives wherever that source resolves rather than on a path worth probing.
 *
 * Everything else is a bare word with no source, which `run` resolves against the conventional kit
 * directory alone. Probing exactly that directory is what makes the answer match what would run.
 */
function namesAKit(word: string, args: string[]): boolean {
  if (word.includes(':') || hasSourceFlag(args)) return true;

  return KIT_EXTENSIONS.some((extension) => existsSync(path.join(process.cwd(), KITS_DIR, `${word}${extension}`)));
}

/**
 * Detect a kit-source flag by scanning raw argv.
 *
 * The scan runs before any flag parsing, so it accepts both `--from value` and `--from=value` and
 * stops at the `--` terminator, after which arguments are positional rather than flags.
 */
function hasSourceFlag(args: string[]): boolean {
  for (const arg of args) {
    if (arg === '--') return false;
    const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (SOURCE_FLAGS.has(flag)) return true;
  }
  return false;
}
