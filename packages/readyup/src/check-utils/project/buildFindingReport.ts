import type { CheckOutcome } from '../../kits/types.ts';
import { declinesFinding } from './declinesFinding.ts';
import { definesOwnImplementation, type OwnImplementation } from './definesOwnImplementation.ts';
import { readSourceText } from './readTrackedSources.ts';

/** One located site a check names. */
export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly symbol?: string | undefined;
}

/** Every finding a project holds, which of them the calling check reports, and how far adoption already got. */
export interface BuildFindingReportOptions<F extends Finding> {
  findings: readonly F[];
  shouldReport: (finding: F) => boolean;
  adoptedCount: number;
  /** The package the check is about, whose own implementation the report passes over. */
  ownImplementation?: OwnImplementation | undefined;
}

/**
 * Reports whether a project holds the findings the calling check names, naming each and how far adoption got.
 *
 * The fraction is derived from every finding passed, not only the reported ones, so the checks of one run share a
 * denominator the reader can compare across them. Passing only the reported findings would state a fraction of a
 * different whole for each check, which is why the selection is made here rather than by the caller.
 *
 * A source declines a finding with an `rdy-ignore` pragma, which drops it from the detail and from both halves of
 * the fraction, so a project that has settled every remaining site reaches completion rather than resting one short.
 * The pragma belongs to readyup rather than to any kit, so a kit inherits it by reporting here and declares nothing
 * for it.
 *
 * A check naming its own package drops the findings sited in that package's implementation the same way. The repo
 * publishing an idiom is where the idiom lives, and a kit reporting it there spends the credibility it needs in
 * every other repo it runs in.
 */
export function buildFindingReport<F extends Finding>(options: BuildFindingReportOptions<F>): CheckOutcome {
  const { adoptedCount, findings, ownImplementation, shouldReport } = options;

  const undeclined = excludeDeclined(findings);
  const retained = excludeOwnImplementation(undeclined, ownImplementation);
  const reported = retained.filter((finding) => shouldReport(finding));
  const progress = {
    count: adoptedCount + retained.length,
    passedCount: adoptedCount,
    type: 'fraction',
  } as const;

  if (reported.length === 0) return { ok: true, progress };
  return { detail: reported.map((finding) => describeFinding(finding)).join(', '), ok: false, progress };
}

// region | Helpers

/** Names one finding by where it is, and by the symbol it declares where it declares one. */
function describeFinding(finding: Finding): string {
  const location = `${finding.path}:${finding.line}`;
  return finding.symbol === undefined ? location : `${finding.symbol} (${location})`;
}

/**
 * Drops the findings a source declined with an `rdy-ignore` pragma.
 *
 * Each path is parted into lines once, so a file holding ten findings costs one read and one split between them. A
 * path holding no readable text declines nothing.
 */
function excludeDeclined<F extends Finding>(findings: readonly F[]): readonly F[] {
  const linesByPath = new Map<string, readonly string[] | undefined>();
  return findings.filter((finding) => {
    if (!linesByPath.has(finding.path)) {
      linesByPath.set(finding.path, readSourceText(finding.path)?.split('\n'));
    }

    const lines = linesByPath.get(finding.path);
    return lines === undefined || !declinesFinding(lines, finding.line);
  });
}

/**
 * Drops the findings sited in the declared package's own implementation.
 *
 * Each path is decided once, so a file holding ten findings is read and blanked once between them.
 */
function excludeOwnImplementation<F extends Finding>(
  findings: readonly F[],
  ownImplementation: OwnImplementation | undefined,
): readonly F[] {
  if (ownImplementation === undefined) return findings;

  const verdicts = new Map<string, boolean>();
  return findings.filter((finding) => {
    let exempt = verdicts.get(finding.path);
    if (exempt === undefined) {
      exempt = definesOwnImplementation(finding.path, ownImplementation);
      verdicts.set(finding.path, exempt);
    }
    return !exempt;
  });
}

// endregion | Helpers
