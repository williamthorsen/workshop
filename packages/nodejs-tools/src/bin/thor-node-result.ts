import { type ReadoutData, serializeReadout } from '@williamthorsen/readout';

/** The exit code of a check that found nothing to fix, or of a run that completed. */
export const EXIT_OK = 0;
/** The exit code of a check that found something to fix. */
export const EXIT_FINDINGS = 1;
/** The exit code of a run that failed, such as a deletion that did not complete or a declined confirmation. */
export const EXIT_FAILED = 1;
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

/** Serializes a result as the one JSON document that `--json` writes to stdout, ending in a newline. */
export function serializeResult(result: ReadoutData): string {
  return `${serializeReadout({ data: result, sensitive: [] })}\n`;
}

/** The text that a result renders to on each stream, each ending in a newline when it is not empty. */
export interface RenderedText {
  readonly stderr: string;
  readonly stdout: string;
}
