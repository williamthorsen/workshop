import { parseArgs as nodeParseArgs } from 'node:util';

import type { OverlayMode } from '../types.ts';
import { extractMessage } from '../utils/error-handling.ts';

/** The CLI invocation parsed from argv: either a request to show help or a resolved overlay command. */
export type ParsedCommand =
  { kind: 'help' } | { kind: 'run'; source: string; target: string | undefined; mode: OverlayMode; json: boolean };

const OPTIONS = {
  verify: { type: 'boolean' },
  create: { type: 'boolean' },
  force: { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

/** Every option name `node:util.parseArgs` accepts, in the undashed form its tokens carry. */
const ACCEPTED_NAMES = new Set<string>(
  Object.entries(OPTIONS).flatMap(([name, option]) => ('short' in option ? [name, option.short] : [name])),
);

/**
 * Parses overlay's CLI arguments via `node:util.parseArgs`.
 *
 * Accepts `--verify`/`--create`/`--force` (mutually exclusive; default `verify`), `--json`, and `--help`/`-h`. The
 * first positional is the required source directory; the second is the optional target. Throws an `Error` with a
 * user-facing message on an unknown option, a value passed to one of these boolean options, multiple mode flags, or
 * a missing source. Never calls `console` or `process.exit`.
 */
export function parseArgs(argv: string[]): ParsedCommand {
  const { values, positionals } = parseStrictArgv(argv);

  if (values.help === true) {
    return { kind: 'help' };
  }

  const mode = resolveMode(values.verify === true, values.create === true, values.force === true);

  const [source, target] = positionals;
  if (source === undefined) {
    throw new Error('missing required argument: <source-dir>');
  }

  return { kind: 'run', source, target, mode, json: values.json === true };
}

// region | Helpers

/** Builds overlay's message for a `node:util.parseArgs` rejection, naming the flag at fault. */
function describeParseFailure(argv: string[], error: unknown): string {
  // The rejection carries only a code, so a permissive second pass supplies the token that names the flag.
  const { tokens } = nodeParseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    tokens: true,
    options: OPTIONS,
  });
  const options = tokens.filter((token) => token.kind === 'option');

  const unknown = options.find((token) => !ACCEPTED_NAMES.has(token.name));
  if (unknown !== undefined) {
    return `unknown option: ${unknown.rawName}`;
  }

  const valued = options.find((token) => token.inlineValue === true);
  if (valued !== undefined) {
    return `option takes no value: ${valued.rawName}`;
  }

  return extractMessage(error);
}

/** Parses argv in strict mode, restating any rejection as an overlay message that keeps the original as `cause`. */
function parseStrictArgv(argv: string[]) {
  try {
    return nodeParseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
  } catch (error: unknown) {
    throw new Error(describeParseFailure(argv, error), { cause: error });
  }
}

/** Resolves the single active mode flag, rejecting more than one. Defaults to `verify`. */
function resolveMode(verify: boolean, create: boolean, force: boolean): OverlayMode {
  const selected = [verify ? 'verify' : undefined, create ? 'create' : undefined, force ? 'force' : undefined].filter(
    (value): value is OverlayMode => value !== undefined,
  );
  if (selected.length > 1) {
    throw new Error('choose only one of --verify, --create, --force');
  }
  return selected[0] ?? 'verify';
}

// endregion | Helpers
