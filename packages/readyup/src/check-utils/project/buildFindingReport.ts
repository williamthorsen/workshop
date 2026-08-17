import type { CheckOutcome } from '../../kits/types.ts';

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
}

/**
 * Reports whether a project holds the findings the calling check names, naming each and how far adoption got.
 *
 * The fraction is derived from every finding passed, not only the reported ones, so the checks of one run share a
 * denominator the reader can compare across them. Passing only the reported findings would state a fraction of a
 * different whole for each check, which is why the selection is made here rather than by the caller.
 */
export function buildFindingReport<F extends Finding>(options: BuildFindingReportOptions<F>): CheckOutcome {
  const { adoptedCount, findings, shouldReport } = options;

  const reported = findings.filter((finding) => shouldReport(finding));
  const progress = {
    count: adoptedCount + findings.length,
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

// endregion | Helpers
