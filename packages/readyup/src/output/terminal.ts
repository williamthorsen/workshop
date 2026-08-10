import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import type { WriteResult } from '../portable/writeFileWithCheck.ts';

/** Tokens whose lines are written to stderr. */
const STDERR_TOKENS: ReadonlySet<TokenName> = new Set<TokenName>(['failedError']);

interface WriteLine {
  claim: string;
  token: TokenName;
  detail?: string;
  reason?: string;
}

/** Writes `message` to stdout as a section heading, parted from whatever precedes it by a blank line. */
export function printStep(message: string): void {
  console.info(`\n${getLayout().formatHeading(message, 'section')}`);
}

/**
 * Writes a check line for `result`, naming the file and then its outcome.
 *
 * An outcome that failed carries its cause in a block beneath and goes to stderr; the rest go to stdout.
 */
export function reportWriteResult(result: WriteResult, dryRun: boolean): void {
  const { claim, detail, reason, token } = describeWriteResult(result, dryRun);

  const lines = [
    getLayout().formatCheckLine({ token, name: claim, ...(detail !== undefined && { detail }) }),
    ...(reason === undefined ? [] : getLayout().formatReasonBlock([reason])),
  ];
  const output = lines.join('\n');

  if (STDERR_TOKENS.has(token)) console.error(output);
  else console.info(output);
}

/**
 * Returns the token and text for a write outcome, phrasing `dryRun` outcomes as what would happen.
 *
 * A skip carries a warning token only when an unreadable file left the outcome undetermined.
 */
function describeWriteResult(result: WriteResult, dryRun: boolean): WriteLine {
  const { error, filePath, outcome } = result;

  switch (outcome) {
    case 'created':
      return { token: 'passed', claim: filePath, detail: dryRun ? 'would create' : 'created' };
    case 'overwritten':
      return { token: 'passed', claim: filePath, detail: dryRun ? 'would overwrite' : 'overwrote' };
    case 'up-to-date':
      return { token: 'passed', claim: filePath, detail: 'up to date' };
    case 'skipped':
      return error === undefined
        ? { token: 'skippedOptional', claim: filePath, detail: 'already exists' }
        : { token: 'failedWarn', claim: filePath, reason: `could not read for comparison: ${error}` };
    case 'failed':
      return {
        token: 'failedError',
        claim: filePath,
        reason: error === undefined ? 'failed to write' : `failed to write: ${error}`,
      };
  }
}
