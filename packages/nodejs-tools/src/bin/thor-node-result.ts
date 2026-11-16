/** The exit code of a check that found nothing to fix. */
export const EXIT_OK = 0;
/** The exit code of a check that found something to fix. */
export const EXIT_FINDINGS = 1;
/** The exit code of a check that does not apply. */
export const EXIT_NOT_APPLICABLE = 3;

/** The name of corepack, as a command and as an npm package. */
export const COREPACK = 'corepack';
/** The asdf plugin that provides node. */
export const PLUGIN = 'nodejs';
/** The name of pnpm, as a command and as an npm package. */
export const PNPM = 'pnpm';
/** The command that regenerates every shim of the nodejs plugin. */
export const RESHIM = 'asdf reshim nodejs';

/** Reports a check's outcome on stdout, one line per entry, with the exit code for that outcome. */
export function report(exitCode: number, lines: readonly string[]): ThorNodeResult {
  return { exitCode, stderr: '', stdout: `${lines.join('\n')}\n` };
}

/** Reports a check that does not apply: the reason on stderr, and whatever was learned on stdout. */
export function reportNotApplicable(reason: string, stdout: string): ThorNodeResult {
  return { exitCode: EXIT_NOT_APPLICABLE, stderr: `${reason}\n`, stdout: `${stdout}\n` };
}

/** What a check should write to each stream and exit with. */
export interface ThorNodeResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}
