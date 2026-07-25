import { layout } from './layout/engine.ts';
import type { TokenName } from './layout/formatter.ts';
import type { WriteResult } from './writeFileWithCheck.ts';

/** Tokens whose lines belong on stderr, so a caller redirecting stdout still sees them. */
const STDERR_TOKENS: ReadonlySet<TokenName> = new Set<TokenName>(['failedError']);

/** A write outcome rendered into the shared vocabulary. */
interface WriteLine {
  claim: string;
  token: TokenName;
  detail?: string;
  reason?: string;
}

/** Print a step label as a section heading. */
export function printStep(message: string): void {
  console.info(layout.formatHeading(message, 'section').join('\n'));
}

/**
 * Print a write result as a check line, sending a hard failure to stderr.
 *
 * Naming the file first is what lets a reader scan a column of paths and see what happened to each;
 * the outcome rides as inline detail, or as a block reason where the outcome is a failure.
 */
export function reportWriteResult(result: WriteResult, dryRun: boolean): void {
  const { claim, detail, reason, token } = describeWriteResult(result, dryRun);

  const lines = [
    layout.formatCheckLine({ token, name: claim, ...(detail !== undefined && { detail }) }),
    ...(reason === undefined ? [] : layout.formatReasonBlock([reason])),
  ];
  const output = lines.join('\n');

  if (STDERR_TOKENS.has(token)) console.error(output);
  else console.info(output);
}

/**
 * Map a write outcome to its token and text.
 *
 * A file left alone because it already exists is a skip, not a warning -- nothing is wrong and
 * nothing needs doing. One left alone because it could not be read to compare *is* a warning: the
 * scaffold cannot say whether the file on disk is what it would have written.
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
