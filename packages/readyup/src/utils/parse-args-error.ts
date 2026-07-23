import { extractMessage } from './error-handling.ts';

/**
 * Translate a caught `node:util.parseArgs` error into a user-facing message.
 *
 * An unknown option is reported against `command`, pointing at the help that lists what the command
 * accepts. For a string flag missing its value (`--flag`, `--flag=`, or `--flag --other`), returns
 * the matching per-flag hint keyed by long flag, or a generic `<flag> requires a value`.
 * Everything else — a boolean given a value, say — passes through to Node's own text, which is
 * already clear.
 */
export function translateParseArgsError(error: unknown, command: string, hints: Record<string, string> = {}): string {
  if (!(error instanceof Error) || !('code' in error)) {
    return extractMessage(error);
  }

  if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const flag = error.message.match(/Unknown option '([^']+)'/)?.[1];
    if (flag !== undefined) {
      return `Unknown option '${flag}'. Run 'rdy ${command} --help' to see available options.`;
    }
  }

  if (error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && !error.message.includes('does not take an argument')) {
    const flag = error.message.match(/(--[a-z][\w-]*)/)?.[1];
    if (flag !== undefined) {
      return hints[flag] ?? `${flag} requires a value`;
    }
  }

  return extractMessage(error);
}
