/** What `resolveOutputWidth` reads to decide how wide a line may be. */
export interface ResolveOutputWidthInput {
  /** Columns reported by the output stream, meaningful only when it is a terminal. */
  columns: number | undefined;
  env: Readonly<Record<string, string | undefined>>;
  isTty: boolean | undefined;
}

/** Environment variable that overrides the terminal's width. */
const COLUMNS_ENV_VAR = 'COLUMNS';

/** Matches a `COLUMNS` value written as a whole number. */
const WHOLE_NUMBER = /^\d+$/;

/**
 * Returns the width to which output fits: `COLUMNS`, then a terminal's width, then `Infinity` for no limit.
 *
 * A `COLUMNS` value that is not a whole number above zero is ignored rather than rejected, because the shell
 * sets it rather than the command line.
 */
export function resolveOutputWidth({ columns, env, isTty }: ResolveOutputWidthInput): number {
  const override = env[COLUMNS_ENV_VAR];
  if (override !== undefined && WHOLE_NUMBER.test(override) && Number(override) > 0) return Number(override);
  if (isTty === true && columns !== undefined && columns > 0) return columns;
  return Infinity;
}
