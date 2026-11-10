import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { usageError } from '../errors/RdyError.ts';

const styleOption = {
  // Declared so that strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/** The `parseArgs` configuration that `parseSubcommandArgs` applies to a subcommand's own options. */
interface SubcommandParseConfig<T extends ParseArgsOptionsConfig> {
  args: string[];
  options: T & typeof styleOption;
  strict: true;
  allowPositionals: true;
}

/** What `parseSubcommandArgs` accepts: argv after the command name, the command's options, and its per-flag hints. */
interface SubcommandArgsInput<T extends ParseArgsOptionsConfig> {
  args: string[];
  command: string;
  /** Messages keyed by long flag (`--config`) that replace the generic `<flag> requires a value`. */
  hints?: Record<string, string>;
  options: T;
}

/**
 * Parses a subcommand's flags strictly, accepting positionals and the router's `--style`.
 *
 * Throws a usage error for a parse failure and for any flag given an empty value (`--flag=`), which
 * `parseArgs` would otherwise accept as an empty string. Positional checks are left to the caller.
 */
export function parseSubcommandArgs<const T extends ParseArgsOptionsConfig>({
  args,
  command,
  hints = {},
  options,
}: SubcommandArgsInput<T>): ReturnType<typeof parseArgs<SubcommandParseConfig<T>>> {
  const config: SubcommandParseConfig<T> = {
    args,
    options: { ...options, ...styleOption },
    strict: true,
    allowPositionals: true,
  };

  let parsed;
  try {
    parsed = parseArgs(config);
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, command, hints), { cause: error });
  }

  for (const [name, value] of Object.entries(parsed.values)) {
    if (value === '') {
      const flag = `--${name}`;
      throw usageError(hints[flag] ?? `${flag} requires a value`);
    }
  }

  return parsed;
}
