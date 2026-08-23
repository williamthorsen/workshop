import type { FindingOutcome, OutcomeFinding } from '../../kits/types.ts';
import type { DeclarationSpan } from '../../portable/listDeclarationSpans.ts';
import { listOwnImplementationSpans, type OwnImplementation } from './listOwnImplementationSpans.ts';

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
 * Returns the findings a project holds, each marked whether the calling check reports it, for the runner to
 * suppress, render, and count.
 *
 * Every retained finding is returned rather than only the reported ones, so the checks of one run share a
 * denominator the reader can compare across them, and so a site a pragma suppresses leaves every check's
 * fraction rather than only the fraction of the check that names it.
 *
 * A check naming its own package drops the findings sited in the declarations implementing it. The repo
 * publishing an idiom is where the idiom lives, and a kit reporting it there spends the credibility it needs
 * in every other repo it runs in; a neighbouring declaration in the same file is ordinary code and is still
 * reported.
 */
export function buildFindingReport<F extends Finding>(options: BuildFindingReportOptions<F>): FindingOutcome {
  const { adoptedCount, findings, ownImplementation, shouldReport } = options;

  const retained = excludeOwnImplementation(findings, ownImplementation);
  return { adoptedCount, findings: retained.map((finding) => toOutcomeFinding(finding, shouldReport(finding))) };
}

// region | Helpers

/**
 * Drops the findings whose line falls inside a declaration implementing the declared package.
 *
 * Each path's exempted lines are resolved once, so a file holding ten findings is read and blanked once
 * between them.
 */
function excludeOwnImplementation<F extends Finding>(
  findings: readonly F[],
  ownImplementation: OwnImplementation | undefined,
): readonly F[] {
  if (ownImplementation === undefined) return findings;

  const spansByPath = new Map<string, readonly DeclarationSpan[]>();
  return findings.filter((finding) => {
    let spans = spansByPath.get(finding.path);
    if (spans === undefined) {
      spans = listOwnImplementationSpans(finding.path, ownImplementation);
      spansByPath.set(finding.path, spans);
    }
    return !isLineInSpans(finding.line, spans);
  });
}

/** Reports whether a line falls inside one of the spans, each of which bounds its own lines inclusively. */
function isLineInSpans(line: number, spans: readonly DeclarationSpan[]): boolean {
  return spans.some((span) => span.startLine <= line && line <= span.endLine);
}

/** Returns a finding as the runner reads it, carrying whether the reporting check names it. */
function toOutcomeFinding(finding: Finding, reported: boolean): OutcomeFinding {
  const { line, path, symbol } = finding;
  return symbol === undefined ? { line, path, reported } : { line, path, reported, symbol };
}

// endregion | Helpers
