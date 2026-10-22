/** What `resolveOutputColor` reads to decide whether rich output is coloured. */
export interface ResolveOutputColorInput {
  env: Readonly<Record<string, string | undefined>>;
}

/** Environment variable whose non-empty value turns colour off, per no-color.org. */
const NO_COLOR_ENV_VAR = 'NO_COLOR';

/** Environment variable naming the terminal type. */
const TERM_ENV_VAR = 'TERM';

/** Terminal type that draws escape sequences as text. */
const DUMB_TERMINAL = 'dumb';

/**
 * Returns whether rich output is coloured: yes unless `NO_COLOR` is non-empty or `TERM` is `dumb`.
 *
 * Whether the stream is a terminal is not read, so output under an explicitly named style is the same for a
 * terminal and a pipe.
 */
export function resolveOutputColor({ env }: ResolveOutputColorInput): boolean {
  const noColor = env[NO_COLOR_ENV_VAR];
  if (noColor !== undefined && noColor !== '') return false;
  return env[TERM_ENV_VAR] !== DUMB_TERMINAL;
}
