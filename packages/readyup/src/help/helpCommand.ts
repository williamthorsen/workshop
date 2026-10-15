import { parseArgs as nodeParseArgs } from 'node:util';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { usageError } from '../errors/RdyError.ts';
import { getStyle, getWidth } from '../layout/engine.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { findNearestWord } from '../portable/findNearestWord.ts';
import { COMMAND_HELP, HELP } from './helpText.ts';
import { readDoc } from './readDoc.ts';
import { renderTopic } from './renderTopic.ts';
import { findTopic, TOPIC_NAMES_BY_STEM, TOPICS } from './topics.ts';

/** Flags that request help, whether given as the command itself or among a subcommand's flags. */
export const HELP_FLAGS = new Set(['--help', '-h']);

/**
 * Prints help for a command or a topic, or the top-level help when given neither.
 *
 * A command takes precedence over a topic of the same name, so `rdy help <subcommand>` always prints that
 * command's own help.
 */
export function helpCommand(flags: string[], json: boolean): number {
  const helpOptions = {
    help: { type: 'boolean', short: 'h' },
    // Declared so that strict parsing accepts them; `routeCommand` read both before dispatch.
    json: { type: 'boolean' },
    style: { type: 'string' },
  } as const;

  let parsed;
  try {
    parsed = nodeParseArgs({ args: flags, options: helpOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'help'), { cause: error });
  }

  const [subject, ...extra] = parsed.positionals;
  if (extra.length > 0) throw usageError('Usage: rdy help [<command|topic>]');
  if (subject === undefined) return writeHelp(HELP, json);

  const commandHelp = Object.hasOwn(COMMAND_HELP, subject) ? COMMAND_HELP[subject] : undefined;
  if (commandHelp !== undefined) return writeHelp(commandHelp, json);

  const topic = findTopic(subject);
  if (topic !== undefined) {
    const options = { style: getStyle(), topicByStem: TOPIC_NAMES_BY_STEM, width: getWidth() };
    return writeHelp(renderTopic(readDoc(topic.file), options), json);
  }

  throw usageError(describeUnknownSubject(subject), { hint: "Run 'rdy help' for a list of topics." });
}

/** Emits help text through the human channel and reports success. */
export function writeHelp(text: string, json: boolean): number {
  writeHuman(`${text}\n`, json);
  return EXIT_OK;
}

// region | Helpers

/** Builds the failure message for an argument naming neither a command nor a topic. */
function describeUnknownSubject(subject: string): string {
  const candidates = [
    ...Object.keys(COMMAND_HELP),
    ...Object.keys(TOPICS),
    ...Object.keys(TOPIC_NAMES_BY_STEM),
  ].toSorted();
  const match = findNearestWord(subject, candidates);

  return match === undefined
    ? `No help available for '${subject}'.`
    : `No help available for '${subject}'. Did you mean 'rdy help ${match}'?`;
}

// endregion | Helpers
