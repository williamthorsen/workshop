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
import { COMPILE_HELP, HELP, INIT_HELP, LIST_HELP, RUN_HELP, VERIFY_HELP } from '../help/helpText.ts';
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
