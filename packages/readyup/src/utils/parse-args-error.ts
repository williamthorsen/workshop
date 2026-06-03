import { extractMessage } from './error-handling.ts';

/**
 * Translate a caught `node:util.parseArgs` error into a user-facing message.
 *
 * For a string flag missing its value (`--flag`, `--flag=`, or `--flag --other`), returns the matching per-flag hint
 * keyed by long flag, or a generic `<flag> requires a value`.
 * All other errors — unknown options, booleans given a value — pass through to Node's own text, which is already clear.
 */
export function translateParseArgsError(error: unknown, hints: Record<string, string> = {}): string {
  if (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' &&
    !error.message.includes('does not take an argument')
  ) {
    const flag = error.message.match(/(--[a-z][\w-]*)/)?.[1];
    if (flag !== undefined) {
      return hints[flag] ?? `${flag} requires a value`;
    }
  }
  return extractMessage(error);
}
