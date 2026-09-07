import type { FindingOutcome, OutcomeFinding } from '../../kits/types.ts';
import type { DeclarationSpan } from '../../portable/listDeclarationSpans.ts';
import { listOwnImplementationSpans, type OwnImplementation } from './listOwnImplementationSpans.ts';

/** One located site named by a check. */
export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly symbol?: string | undefined;
}

/** Every finding held by a project, which of them the calling check reports, and how far adoption already got. */
export interface BuildFindingReportOptions<F extends Finding> {
  findings: readonly F[];
  shouldReport: (finding: F) => boolean;
  adoptedCount: number;
  /** The package that the check is about, whose own implementation the report passes over. */
  ownImplementation?: OwnImplementation | undefined;
}

/**
 * Returns the findings held by a project, each marked whether the calling check reports it, for the runner to
 * suppress, render, and count.
 *
 * Every retained finding is returned rather than only the reported ones, so the checks of one run share a
 * denominator that the reader can compare across them, and so a site suppressed by a pragma leaves every
 * check's fraction rather than only the fraction of the check that names it.
 *
 * The runner names each reported finding as `symbol (path:line)`, or as `path:line` where the finding declares
 * no symbol.
 *
 * A check naming its own package drops the findings sited in the declarations implementing it, from the detail
 * and from both halves of the fraction. The repo publishing an idiom is where the idiom lives, and a kit
 * reporting it there loses the credibility that it needs in every other repo in which it runs; a neighbouring
 * declaration in the same file is ordinary code and is still reported.
 *
 * A declaration qualifies by being exported under one of the named exports, from a file inside a workspace whose
 * `package.json` names the package. It owns the lines from its own head to the line before the next head, or to
 * the file's last line where it is the last, because the closing brace is not a reliable end marker: A generic
 * constraint and a return-type annotation can each hold braces of their own, and an overload signature has no
 * body to close. A span cut short reports the implementation that the rule exists to exempt. A re-exporting barrel
 * declares no implementation and holds no exempted lines, a file declaring the name without exporting it is a
 * hand-roll and is still reported, and a file declaring the export under another name and renaming it on export
 * from a second file is not recognized.
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

/** Returns a finding as the runner reads it, with whether the reporting check names it. */
function toOutcomeFinding(finding: Finding, reported: boolean): OutcomeFinding {
  const { line, path, symbol } = finding;
  return symbol === undefined ? { line, path, reported } : { line, path, reported, symbol };
}

// endregion | Helpers
