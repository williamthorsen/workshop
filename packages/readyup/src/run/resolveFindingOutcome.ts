import { readSourceText } from '../check-utils/project/readTrackedSources.ts';
import type { CheckOutcome, FindingOutcome, OutcomeFinding } from '../kits/types.ts';
import { declinesFinding } from './declinesFinding.ts';
import type { PragmaLedger } from './PragmaLedger.ts';

/**
 * Returns a check's verdict, reason, and fraction, the findings a pragma declined for it having been dropped.
 *
 * The denominator counts every surviving site, reported or not, so the checks of one run share a denominator
 * the reader can compare across them, and a declined site leaves both halves of it. `adoptedCount` is the
 * numerator; omitted, the outcome carries no progress at all.
 *
 * A ledger, where one is passed, is told which sites the check's pragmas declined, and the paths it declared in
 * `scanned`. A sweep read through `readTrackedSources` reports itself, so what arrives here is the reading a
 * check did some other way. A caller wanting the run to hold no record of a check passes none.
 */
export function resolveFindingOutcome(
  outcome: FindingOutcome,
  checkIds: readonly string[],
  ledger?: PragmaLedger,
): CheckOutcome {
  if (outcome.scanned !== undefined) ledger?.recordScanned(outcome.scanned);

  const surviving = excludeDeclined(outcome.findings, checkIds, ledger);
  const reported = surviving.filter((finding) => finding.reported);

  const { adoptedCount } = outcome;
  const progress =
    adoptedCount === undefined
      ? undefined
      : ({ count: adoptedCount + surviving.length, passedCount: adoptedCount, type: 'fraction' } as const);

  if (reported.length === 0) return { ok: true, progress };
  return { detail: reported.map((finding) => describeFinding(finding)).join(', '), ok: false, progress };
}

// region | Helpers

/** Names one finding by where it is, and by the symbol it declares where it declares one. */
function describeFinding(finding: OutcomeFinding): string {
  const location = `${finding.path}:${finding.line}`;
  return finding.symbol === undefined ? location : `${finding.symbol} (${location})`;
}

/**
 * Drops the findings a source declined with an `rdy-ignore` pragma naming this check or naming no check.
 *
 * Each path is parted into lines once, so a file holding ten findings costs one read and one split between
 * them. A path holding no readable text declines nothing.
 */
function excludeDeclined(
  findings: readonly OutcomeFinding[],
  checkIds: readonly string[],
  ledger: PragmaLedger | undefined,
): readonly OutcomeFinding[] {
  const linesByPath = new Map<string, readonly string[] | undefined>();
  return findings.filter((finding) => {
    if (!linesByPath.has(finding.path)) {
      linesByPath.set(finding.path, readSourceText(finding.path)?.split('\n'));
    }

    const lines = linesByPath.get(finding.path);
    const isDeclined = lines !== undefined && declinesFinding(lines, finding.line, checkIds);
    if (isDeclined) ledger?.recordDeclined(finding.path, finding.line);
    return !isDeclined;
  });
}

// endregion | Helpers
