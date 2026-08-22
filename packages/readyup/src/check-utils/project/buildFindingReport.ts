import type { FindingOutcome, OutcomeFinding } from '../../kits/types.ts';
import { definesOwnImplementation, type OwnImplementation } from './definesOwnImplementation.ts';
import type { ProjectSource } from './readTrackedSources.ts';

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

  /**
   * The sources the check swept, which the outcome reports as the paths it examined.
   *
   * A path the own-implementation exemption dropped findings from was still examined, so it is declared
   * here as any other. Omitted, the outcome declares no sweep at all.
   */
  sources?: readonly ProjectSource[] | undefined;
}

/**
 * Returns the findings a project holds, each marked whether the calling check reports it, for the runner to
 * decline, render, and count.
 *
 * Every retained finding is returned rather than only the reported ones, so the checks of one run share a
 * denominator the reader can compare across them, and so a site a pragma declines leaves every check's
 * fraction rather than only the fraction of the check that names it.
 *
 * A check naming its own package drops the findings sited in that package's implementation. The repo
 * publishing an idiom is where the idiom lives, and a kit reporting it there spends the credibility it needs
 * in every other repo it runs in.
 */
export function buildFindingReport<F extends Finding>(options: BuildFindingReportOptions<F>): FindingOutcome {
  const { adoptedCount, findings, ownImplementation, shouldReport, sources } = options;

  const retained = excludeOwnImplementation(findings, ownImplementation);
  return {
    adoptedCount,
    findings: retained.map((finding) => toOutcomeFinding(finding, shouldReport(finding))),
    ...(sources !== undefined && { scanned: sources.map((source) => source.path) }),
  };
}

// region | Helpers

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

/** Returns a finding as the runner reads it, carrying whether the reporting check names it. */
function toOutcomeFinding(finding: Finding, reported: boolean): OutcomeFinding {
  const { line, path, symbol } = finding;
  return symbol === undefined ? { line, path, reported } : { line, path, reported, symbol };
}

// endregion | Helpers
