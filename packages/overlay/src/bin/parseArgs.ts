import { parseArgs as nodeParseArgs } from 'node:util';

import type { OverlayMode } from '../types.ts';

/** The CLI invocation parsed from argv: either a request to show help or a resolved overlay command. */
export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'run'; source: string; target: string | undefined; mode: OverlayMode; json: boolean };

/**
 * Parse overlay's CLI arguments via `node:util.parseArgs`.
 *
 * Accepts `--verify`/`--create`/`--force` (mutually exclusive; default
 * `verify`), `--json`, and `--help`/`-h`. The first positional is the required
 * source directory; the second is the optional target. Throws an `Error` with a
 * user-facing message on unknown options, multiple mode flags, or a missing
 * source. Never calls `console` or `process.exit`.
 */
export function parseArgs(argv: string[]): ParsedCommand {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      verify: { type: 'boolean' },
      create: { type: 'boolean' },
      force: { type: 'boolean' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

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

/** Resolve the single active mode flag, rejecting more than one. Defaults to `verify`. */
function resolveMode(verify: boolean, create: boolean, force: boolean): OverlayMode {
  const selected = [verify ? 'verify' : undefined, create ? 'create' : undefined, force ? 'force' : undefined].filter(
    (value): value is OverlayMode => value !== undefined,
  );
  if (selected.length > 1) {
    throw new Error('choose only one of --verify, --create, --force');
  }
  return selected[0] ?? 'verify';
}
