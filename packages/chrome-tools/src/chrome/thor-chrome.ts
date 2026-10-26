import { setTimeout as sleep } from 'node:timers/promises';
import tty from 'node:tty';

import {
  type FlagSchema,
  type OperandDefinition,
  parseArgs,
  ParseError,
  type ParseResult,
  type ParseSpec,
} from '@williamthorsen/toolbelt.cli/candidate';

import { spawnDetached } from '../portable/spawn-detached.ts';
import type { CommandOutput } from '../shared/output.ts';
import { runCommand } from '../shared/run-command.ts';
import { type DeleteOptions, deleteProfiles } from './delete.ts';
import { quitIdleProfiles } from './idle.ts';
import {
  createInvocation,
  type Invocation,
  refuse,
  type ThorChromeDeps,
  ThorChromeRefusal,
  USAGE_CODE,
} from './invocation.ts';
import { launchProfile } from './launch.ts';
import { listProfiles } from './list.ts';
import { quitProfiles } from './quit.ts';
import { renderRefusal } from './render.ts';
import { showInstancePage } from './show-instance-page.ts';
import { showStatus } from './status.ts';
import { formatUsage } from './usage.ts';

const VERBS = ['delete', 'launch', 'list', 'quit', 'show-instance-page', 'status'] as const;
type Verb = (typeof VERBS)[number];
const VERB_NAMES: ReadonlySet<string> = new Set(VERBS);

const JSON_FLAG = { json: { type: 'boolean', description: 'Report as one JSON document on stdout' } } as const;
const PORT_FLAG = { port: { type: 'string', description: 'Remote-debugging port' } } as const;
const PROFILES_OPERAND = [{ name: 'profiles', description: 'Profile names', optional: true, variadic: true }] as const;

/**
 * Runs thor-chrome on its arguments: reads `--json` and `--help` anywhere, picks the verb, and reports a refusal of
 * the whole invocation in the requested format.
 *
 * `--json` replaces every report and every refusal with one document on stdout, giving a caller that is not a person
 * addressable fields rather than prose. A refusal includes a stable code, which makes each recovery selectable.
 */
export async function runThorChrome(
  args: readonly string[],
  output: CommandOutput,
  deps: ThorChromeDeps = createProcessDeps(),
): Promise<number> {
  // Read --json and --help ahead of any parse, so that a refusal raised by a parse renders in the format that the
  // caller asked for, and --help shows the usage whatever precedes it
  const invocation = createInvocation(output, args.includes('--json') ? 'json' : 'prose', deps);
  if (args.includes('--help') || args.includes('-h')) {
    output.stdout.write(formatUsage(output.name, invocation.profilesDir));
    return 0;
  }

  try {
    const { rest, verb } = selectVerb(invocation, args);
    return await dispatchVerb(invocation, verb, rest);
  } catch (error) {
    if (error instanceof ThorChromeRefusal) return renderRefusal(invocation, error);
    throw error;
  }
}

// region | Helpers

/** Builds the dependencies of a run in this process. */
function createProcessDeps(): ThorChromeDeps {
  return {
    env: process.env,
    isStdoutTerminal: tty.isatty(1),
    kill: (pid) => {
      process.kill(pid, 'SIGTERM');
    },
    now: () => Date.now(),
    run: runCommand,
    sleep: async (milliseconds) => {
      await sleep(milliseconds);
    },
    spawnDetached,
  };
}

/** Parses a verb's arguments and runs it. */
async function dispatchVerb(invocation: Invocation, verb: Verb, args: readonly string[]): Promise<number> {
  switch (verb) {
    case 'delete': {
      const { flags, operands } = parseVerbArgs(invocation, verb, args, {
        flags: {
          ...JSON_FLAG,
          all: { type: 'boolean', description: 'Select every profile' },
          derived: { type: 'boolean', description: "Select the working directory's derived profile alone" },
          dryRun: { type: 'boolean', description: 'Report what would be removed' },
          force: { type: 'boolean', description: 'Quit a running profile first' },
          stale: { type: 'boolean', description: 'Select every stale profile' },
        },
        operands: PROFILES_OPERAND,
      });
      const selection = readDeleteSelection(invocation, flags, operands.profiles);
      return deleteProfiles(invocation, {
        isDryRun: flags.dryRun,
        isForce: flags.force,
        names: operands.profiles,
        selection,
      });
    }
    case 'launch': {
      const { flags, operands } = parseVerbArgs(invocation, verb, args, {
        flags: {
          ...JSON_FLAG,
          ...PORT_FLAG,
          browser: { type: 'string', description: 'Browser to launch' },
          create: { type: 'boolean', description: 'Permit creating a profile' },
          dryRun: { type: 'boolean', description: 'Print the launch command' },
          profile: { type: 'string', description: 'Profile to launch' },
        },
        operands: [{ name: 'urls', description: 'Pages to open', optional: true, variadic: true }],
      });
      return launchProfile(invocation, {
        browser: flags.browser,
        isCreate: flags.create,
        isDryRun: flags.dryRun,
        port: flags.port,
        profile: flags.profile,
        urls: operands.urls,
      });
    }
    case 'list': {
      const { flags, operands } = parseVerbArgs(invocation, verb, args, {
        flags: { ...JSON_FLAG, stale: { type: 'boolean', description: 'List only stale profiles' } },
        operands: PROFILES_OPERAND,
      });
      const [first] = operands.profiles;
      if (first !== undefined) {
        throw refuse(invocation, USAGE_CODE, `list takes no positional arguments (got '${first}')`);
      }
      return listProfiles(invocation, flags.stale);
    }
    case 'quit': {
      const { flags, operands } = parseVerbArgs(invocation, verb, args, {
        flags: {
          ...JSON_FLAG,
          all: { type: 'boolean', description: 'Quit every running profile' },
          idle: { type: 'string', description: 'Quit every browser without a client for this long' },
        },
        operands: PROFILES_OPERAND,
      });
      const [first] = operands.profiles;
      if (flags.all && flags.idle !== undefined) {
        throw refuse(invocation, USAGE_CODE, '--all and --idle each select a different set');
      }
      if (flags.all && first !== undefined) {
        const message = `--all selects every running profile, so it takes no profile name (got '${first}')`;
        throw refuse(invocation, USAGE_CODE, message);
      }
      if (flags.idle !== undefined && first !== undefined) {
        const message = `--idle selects every idle running profile, so it takes no profile name (got '${first}')`;
        throw refuse(invocation, USAGE_CODE, message);
      }
      if (flags.idle !== undefined) return quitIdleProfiles(invocation, flags.idle);
      return quitProfiles(invocation, operands.profiles, flags.all);
    }
    case 'show-instance-page': {
      const { operands } = parseVerbArgs(invocation, verb, args, { flags: JSON_FLAG, operands: PROFILES_OPERAND });
      const [first, second] = operands.profiles;
      if (second !== undefined) {
        const message = `show-instance-page takes one profile name (got '${first ?? ''}' and '${second}')`;
        throw refuse(invocation, USAGE_CODE, message);
      }
      return showInstancePage(invocation, first);
    }
    case 'status': {
      const { flags, operands } = parseVerbArgs(invocation, verb, args, {
        flags: { ...JSON_FLAG, ...PORT_FLAG },
        operands: PROFILES_OPERAND,
      });
      const [first, second] = operands.profiles;
      if (second !== undefined) {
        throw refuse(invocation, USAGE_CODE, `status takes one profile name (got '${first ?? ''}' and '${second}')`);
      }
      return showStatus(invocation, first, flags.port);
    }
  }
}

/** Reports whether a word names a verb. */
function isVerb(word: string): word is Verb {
  return VERB_NAMES.has(word);
}

/**
 * Parses a verb's arguments, refusing a malformed command line with thor-chrome's own usage message, which a `--json`
 * caller reads as the error's message.
 */
function parseVerbArgs<const S extends FlagSchema, const O extends readonly OperandDefinition[]>(
  invocation: Invocation,
  verb: Verb,
  args: readonly string[],
  spec: ParseSpec<S, O>,
): ParseResult<S, O> {
  try {
    return parseArgs(args, spec);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    if (error.kind === 'unknown-flag')
      throw refuse(invocation, USAGE_CODE, `unknown option ${error.token} for ${verb}`);
    if (error.kind === 'missing-value') throw refuse(invocation, USAGE_CODE, `${error.token} requires a value`);
    throw refuse(invocation, USAGE_CODE, error.message);
  }
}

/**
 * Returns the set of profiles that a delete acts on, refusing more than one selector, and a selector combined with a
 * profile name.
 */
function readDeleteSelection(
  invocation: Invocation,
  flags: { all: boolean; derived: boolean; stale: boolean },
  names: readonly string[],
): DeleteOptions['selection'] {
  const selectors = (['all', 'derived', 'stale'] as const).filter((selector) => flags[selector]);
  if (selectors.length > 1) {
    const message = `${selectors.map((selector) => `--${selector}`).join(' and ')} each select a different set`;
    throw refuse(invocation, USAGE_CODE, message);
  }
  const [selection = 'profile'] = selectors;
  const [first] = names;
  if (selection !== 'profile' && first !== undefined) {
    const message = `--${selection} selects the profiles to delete, so it takes no profile name (got '${first}')`;
    throw refuse(invocation, USAGE_CODE, message);
  }
  return selection;
}

/**
 * Returns the verb and the arguments that it parses. The first argument other than `--json` names the verb. An option
 * there leaves the whole list to a launch, and so does a URL, which contains a dot, a colon, or a slash; a bare word
 * that names no verb is a mistyped one.
 */
function selectVerb(invocation: Invocation, args: readonly string[]): { rest: string[]; verb: Verb } {
  const index = args.findIndex((argument) => argument !== '--json');
  const word = args[index];
  if (word === undefined || word.startsWith('-') || /[.:/]/.test(word)) return { rest: [...args], verb: 'launch' };
  if (!isVerb(word)) throw refuse(invocation, USAGE_CODE, `unknown command '${word}'`);
  return { rest: args.toSpliced(index, 1), verb: word };
}

// endregion | Helpers
