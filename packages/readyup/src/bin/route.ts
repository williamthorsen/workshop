import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { compileCommand } from '../compile/compileCommand.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, internalError, toRdyError, usageError } from '../errors/RdyError.ts';
import { HELP_FLAGS, helpCommand, writeHelp } from '../help/helpCommand.ts';
import { COMPILE_HELP, HELP, INIT_HELP, LIST_HELP, RUN_HELP, VERIFY_HELP } from '../help/helpText.ts';
import { initCommand } from '../init/initCommand.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout, setStyle } from '../layout/engine.ts';
import { describeInvalidStyle, resolveStyle, STYLE_FLAG } from '../layout/resolveStyle.ts';
import { listCommand } from '../list/listCommand.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { findNearestWord } from '../portable/findNearestWord.ts';
import { createRemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { formatJsonError } from '../reporting/formatJsonError.ts';
import { parseRunArgs } from '../run/parseRunArgs.ts';
import { resolveAllKitSources } from '../run/resolveAllKitSources.ts';
import { resolveKitSources } from '../run/resolveKitSources.ts';
import { runCommand } from '../run/runCommand.ts';
import { verifyCommand } from '../verify/verifyCommand.ts';
import { VERSION } from '../version.ts';
import { EXIT_OK, EXIT_TOOL_FAILURE } from './exitCodes.ts';
import { hasJsonFlag } from './hasJsonFlag.ts';

/** Command names against which a mistyped bare word is matched, including the implicit `run`. */
export const COMMAND_NAMES = ['compile', 'help', 'init', 'list', 'run', 'verify'];

/** Flag naming the config file that a run reads in place of the lookup chain. */
const CONFIG_FLAG = '--config';

/** Flags naming where a kit comes from, each of which resolves it somewhere the local probe cannot see. */
const SOURCE_FLAGS = new Set(['--file', '-f', '--from', '--internal', '--url']);

/**
 * Routes CLI arguments to the appropriate subcommand, returning the exit code that it produced.
 *
 * Every failure that prevents the invocation from completing is rendered here -- as prose on stderr, or as the JSON
 * error envelope on stdout when `--json` is in argv -- so no command needs an error-reporting path of its own.
 */
export async function routeCommand(args: string[]): Promise<number> {
  const json = hasJsonFlag(args);

  // Binding the style precedes the try because the catch renders through it: A style named in argv has
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
 * Renders a failure that no awaited call observed, and returns its exit code.
 *
 * The escape is itself the defect, so the failure is classified `internal` whatever the escaped value's own
 * classification, and its message is kept in the text.
 */
export function reportEscapedFailure(error: unknown, json: boolean): number {
  const escaped = internalError(`Nothing awaited this failure: ${describeError(error)}`, {
    cause: error,
    hint: 'A check that starts async work must await it or return it.',
  });
  return reportFailure(escaped, json);
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

  if (command === 'help') {
    return helpCommand(args.slice(1), json);
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
  // never reaches it: Naming the subcommand says the word is a kit.
  const typoMatch = findNearestWord(command, COMMAND_NAMES);
  if (typoMatch !== undefined && !(await namesAKit(command, args))) {
    throw usageError(`Unknown command '${command}'. Did you mean 'rdy ${typoMatch}'?`);
  }

  // Default: treat all args as `run` arguments.
  return handleRun(args, json);
}

/** Parses and executes the `run` subcommand. */
async function handleRun(flags: string[], json: boolean): Promise<number> {
  if (wantsHelp(flags)) return writeHelp(RUN_HELP, json);

  const parsed = parseRunArgs(flags);

  // Skip config when an external source flag is active -- external modes don't use config values.
  // `--packages` is not one of them: The config is where the packages that it runs are named.
  const hasExternalSource =
    parsed.filePath !== undefined || parsed.fromValue !== undefined || parsed.urlValue !== undefined;

  const config = hasExternalSource ? undefined : await loadRunConfig(parsed.configPath);
  const configFields =
    config === undefined
      ? undefined
      : {
          compile: config.compile,
          internalDir: config.internal.dir,
          internalInfix: config.internal.infix,
          configuredPackages: config.packages,
        };
  const remote = createRemoteFetchContext({ reload: parsed.noCache });

  const kitEntries = parsed.all
    ? await resolveAllKitSources({
        fromValue: parsed.fromValue,
        jit: parsed.jit,
        internal: parsed.internal,
        packages: parsed.packages,
        remote,
        ...configFields,
      })
    : resolveKitSources({
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
      remote,
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

  if (parsed.positionals.length > 0) {
    throw usageError('rdy init does not accept positional arguments.');
  }

  return initCommand({ dryRun: parsed.values['dry-run'] === true, force: parsed.values.force === true });
}

/**
 * Returns `argv` without a leading `--style` and the value beside it.
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

/** Returns `true` when the flags request help for the current subcommand. */
function wantsHelp(flags: string[]): boolean {
  return flags.some((f) => HELP_FLAGS.has(f));
}

/** Loads the config that a run reads, reporting a file that cannot be evaluated as a config error. */
async function loadRunConfig(overridePath: string | undefined): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({ ...(overridePath !== undefined && { overridePath }) });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error, hint: extractHint(error) });
  }
}

/**
 * Reports whether a bare word is a kit rather than a candidate command typo.
 *
 * A ':' checklist filter and a source flag are both kit syntax that no command uses, so either
 * settles the question outright: Under them the word is a kit by construction, and the kit that it
 * names lives wherever that source resolves rather than on a path worth probing.
 *
 * Everything else is a bare word with no source, which `run` resolves against the project's configured
 * directories: its bundles in `compile.outDir`, its sources in `compile.srcDir`. Probing exactly those is
 * what makes the result match what would run, so the probe reads the config that the run would read,
 * `--config` override included.
 *
 * The config load runs only for a word that `findNearestWord` already matched, so an ordinary invocation
 * never pays for it. A config that fails to load is reported as the config error that it is, rather than
 * surfacing as a typo suggestion for a word that may well name a kit.
 */
async function namesAKit(word: string, args: string[]): Promise<boolean> {
  if (word.includes(':') || hasSourceFlag(args)) return true;

  const { compile } = await loadRunConfig(readConfigFlag(args));
  const cwd = process.cwd();
  return (
    existsSync(path.join(cwd, compile.outDir, `${word}.js`)) || existsSync(path.join(cwd, compile.srcDir, `${word}.ts`))
  );
}

/**
 * Returns the `--config` value in raw argv, or `undefined` where argv names none.
 *
 * Scans the way `hasSourceFlag` does, because it runs at the same point, before any flag parsing: it
 * accepts both `--config value` and `--config=value` and stops at the `--` terminator. An empty value is
 * read as absent, which is how `parseRunArgs` reads one, and leaves the run to reject it.
 */
function readConfigFlag(args: string[]): string | undefined {
  for (const [index, arg] of args.entries()) {
    if (arg === '--') return undefined;
    if (arg === CONFIG_FLAG) return args[index + 1] || undefined;
    if (arg.startsWith(`${CONFIG_FLAG}=`)) return arg.slice(CONFIG_FLAG.length + 1) || undefined;
  }
  return undefined;
}

/**
 * Detects a kit-source flag by scanning raw argv.
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
