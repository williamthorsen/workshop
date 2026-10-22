import type { RdyReport, RdyResult, Severity } from '../../src/kits/types.ts';
import { getColor, getLayout, getStyle, setColor, setStyle } from '../../src/layout/engine.ts';
import { richFormatter, type TokenName } from '../../src/layout/formatter.ts';
import { type BreadcrumbSegment, resolveWorstToken, type SummaryRow } from '../../src/layout/layoutEngine.ts';
import { formatCombinedSummary } from '../../src/reporting/formatCombinedSummary.ts';
import { formatJsonReport } from '../../src/reporting/formatJsonReport.ts';
import { formatRunVerdict } from '../../src/reporting/formatRunVerdict.ts';
import { countResults, renderReportSections } from '../../src/reporting/reportRdy.ts';
import { meetsThreshold } from '../../src/severity/meetsThreshold.ts';
import { DEPLOY_KIT } from './deployKit.ts';
import type { ChecklistModel, CheckModel, KitModel } from './kits.ts';
import { escapeHtml } from './toHtml.ts';

/** The failure threshold of every run that the deck shows, which is readyup's default. */
const FAIL_ON: Severity = 'error';

/** The reporting threshold of every run that the deck shows, which is readyup's default. */
const REPORT_ON: Severity = 'recommend';

/** Whether each of a kit's conditions is on, keyed by the condition's id. */
export type Environment = Readonly<Record<string, boolean>>;

/** One line of the terminal, at the step that reveals it; `printed` is false for a line that the deck adds. */
export interface TerminalLine {
  at: number;
  printed: boolean;
  text: string;
}

/** A caption, as HTML, at the step that it describes. */
export interface Caption {
  at: number;
  html: string;
}

/** A row of a kit page's tree panel: a checklist's name, or a check with the glyph of its outcome. */
export type TreeRow =
  | { at: number; glyph: string; kind: 'checklist'; name: string }
  | { at: number; depth: number; glyph: string; kind: 'check'; name: string; status: Status };

/** A kit rendered in one environment, each part placed at the step that reveals it. */
export interface RenderedKit {
  captions: Caption[];
  exit: 0 | 1;
  exitAt: number;
  json: string;
  lines: TerminalLine[];
  steps: number;
  tree: TreeRow[];
}

/** A check's outcome as the deck styles it: the severity at which it failed, or what else became of it. */
type Status = 'blocked' | 'pass' | 'skip' | Severity;

/** A check evaluated in an environment, with the step that reveals it and the result that readyup renders. */
interface EvaluatedCheck {
  at: number;
  check: CheckModel;
  result: RdyResult;
  status: Status;
}

/**
 * Returns a kit's run in `env` as readyup prints it, as `rdy run --json` prints it, and as the deck narrates it.
 *
 * Each check takes one step, each checklist's fix recap and count line one more, and the verdict the last.
 */
export function renderKit(kit: KitModel, env: Environment): RenderedKit {
  const previousColor = getColor();
  const previousStyle = getStyle();
  setStyle('rich');
  setColor(true);
  try {
    return composeKit(kit, env);
  } finally {
    setStyle(previousStyle);
    setColor(previousColor);
  }
}

/** Returns the terminal lines of the deploy run that "A run, step by step" shows. */
export function renderDeployRun(): TerminalLine[] {
  return renderKit(DEPLOY_KIT, buildDefaultEnvironment(DEPLOY_KIT)).lines;
}

// region | Helpers

/** Returns the environment in which every condition of `kit` takes its declared default. */
function buildDefaultEnvironment(kit: KitModel): Environment {
  return Object.fromEntries(kit.conditions.map((condition) => [condition.id, condition.on]));
}

/**
 * Returns the segments heading a kit's blocks, as a single-kit run builds them: the package and the kit when the kit
 * came from one, then the checklist when the kit has several.
 */
function buildSegments(kit: KitModel, checklist: ChecklistModel): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];
  if (kit.origin !== undefined) {
    const packageName = kit.origin.source.replace(/^npm:/u, '');
    const version = kit.origin.version === undefined ? '' : `@${kit.origin.version}`;
    segments.push({ role: 'sourcePackage', text: `${packageName}${version}` }, { role: 'kit', text: kit.name });
  }
  if (kit.checklists.length > 1) segments.push({ role: 'checklist', text: checklist.name });
  return segments;
}

/** Returns the result that readyup would record for a check with `status`. */
function buildResult(check: CheckModel, depth: number, status: Status): RdyResult {
  const base = {
    name: check.name,
    id: check.id ?? null,
    severity: check.severity,
    quiet: false,
    error: null,
    progress:
      check.progress === undefined || status === 'blocked'
        ? null
        : { type: 'fraction' as const, passedCount: check.progress[0], count: check.progress[1] },
    examinedCount: check.findings === true ? 0 : null,
    durationMs: check.ms ?? 0,
    depth,
  };

  if (status === 'pass') return { ...base, status: 'passed', ok: true, detail: check.detail ?? null };
  if (status === 'skip') return { ...base, status: 'skipped', ok: null, skipReason: 'n/a', detail: check.na ?? null };
  if (status === 'blocked') return { ...base, status: 'skipped', ok: null, skipReason: 'precondition', detail: null };
  return { ...base, status: 'failed', ok: false, detail: check.failDetail ?? null, fix: check.fix ?? null };
}

/** Returns the caption narrating one check's outcome. */
function captionFor({ check, status }: EvaluatedCheck): string {
  const name = `<code>${escapeHtml(check.name)}</code>`;
  const childCount = check.checks?.length ?? 0;
  const under = childCount === 1 ? 'the check under it' : `the ${childCount} checks under it`;

  if (status === 'pass') {
    return childCount > 0 ? `${name} passes, so ${under} ${childCount === 1 ? 'runs' : 'run'}` : `${name} passes`;
  }
  if (status === 'skip') return `${name} is skipped: ${escapeHtml(check.na ?? '')}`;
  if (status === 'blocked') return `${name} never ran: the check above it failed`;

  const reason = check.failDetail === undefined ? '' : `: ${escapeHtml(check.failDetail.split('\n', 1)[0] ?? '')}`;
  const blocked = childCount > 0 ? `; ${under} ${childCount === 1 ? 'is' : 'are'} blocked` : '';
  return `${name} fails at <code>${status}</code>${reason}${blocked}`;
}

/** Composes a kit's run block by block, as `rdy run` writes it, with the deck's steps and narration. */
function composeKit(kit: KitModel, env: Environment): RenderedKit {
  const layout = getLayout();
  const lines: TerminalLine[] = [];
  const captions: Caption[] = [];
  const tree: TreeRow[] = [];
  const evaluated: EvaluatedCheck[] = [];
  const entries: Array<{ name: string; report: RdyReport }> = [];
  const summaryRows: SummaryRow[] = [];
  const isMultiChecklist = kit.checklists.length > 1;
  let step = 0;

  /** Adds each line of `text`, as rdy prints it, at step `at`. */
  function print(at: number, text: string): void {
    for (const line of text.split('\n')) lines.push({ at, printed: true, text: line });
  }

  for (const [index, checklist] of kit.checklists.entries()) {
    const checks = evaluateChecklist(checklist, env, step);
    step += checks.length;
    const headAt = index === 0 ? 0 : step - checks.length;
    const segments = buildSegments(kit, checklist);

    if (index > 0) print(headAt, '');
    if (segments.length > 0) print(headAt, layout.formatBreadcrumb(segments, 'kit'));
    if (isMultiChecklist) {
      tree.push({ at: headAt, glyph: richFormatter.tokens.checklist.text, kind: 'checklist', name: checklist.name });
    }

    const results = checks.map(({ result }) => result);
    const report: RdyReport = {
      results,
      passed: results.every((result) => result.status !== 'failed' || !meetsThreshold(result.severity, FAIL_ON)),
      durationMs: checklist.ms,
    };
    const sections = renderReportSections(report, { reportOn: REPORT_ON });
    const stepByResult = new Map(checks.map(({ at, result }) => [result, at]));
    for (const { result, lines: resultLines } of sections.results) {
      print(stepByResult.get(result) ?? headAt, resultLines.join('\n'));
    }

    for (const evaluatedCheck of checks) {
      const { at, result, status } = evaluatedCheck;
      const glyph = richFormatter.tokens[resolveResultToken(result)].text;
      tree.push({ at, depth: result.depth, glyph, kind: 'check', name: result.name, status });
      captions.push({ at, html: captionFor(evaluatedCheck) });
    }

    step++;
    print(step, [...sections.fixes, sections.countLine].join('\n'));
    captions.push({
      at: step,
      html:
        sections.fixes.length > 0
          ? 'Each failure prints its fix under <code>Fixes</code>, then the count line'
          : 'The count line: each result counts once',
    });

    evaluated.push(...checks);
    entries.push({ name: checklist.name, report });
    summaryRows.push({ counts: countResults(report.results), durationMs: report.durationMs, segments });
  }

  step++;
  const verdictAt = step;
  if (summaryRows.length > 1) {
    print(verdictAt, '');
    print(verdictAt, formatCombinedSummary(summaryRows));
  }
  const passed = entries.every(({ report }) => report.passed);
  const exit = passed ? 0 : 1;
  print(verdictAt, '');
  print(
    verdictAt,
    formatRunVerdict({
      kitThresholds: [{ kitName: kit.name, failOn: FAIL_ON }],
      missingKitCount: 0,
      passed,
      withheld: undefined,
    }),
  );
  lines.push({ at: verdictAt, printed: false, text: `exit ${exit}` });

  const worstSeverity = countResults(evaluated.map(({ result }) => result)).worstSeverity;
  captions.push({ at: verdictAt, html: describeVerdict(worstSeverity, passed) });
  captions.unshift({ at: 0, html: describeKit(kit, evaluated) });

  const json = formatJsonReport(
    [
      {
        name: kit.name,
        ...(kit.origin !== undefined && { origin: kit.origin }),
        ...(kit.compiledWith !== undefined && { compiledWith: kit.compiledWith }),
        entries,
        failOn: FAIL_ON,
        reportOn: REPORT_ON,
      },
    ],
    { detail: 'full' },
  );

  return {
    captions,
    exit,
    exitAt: verdictAt,
    json: indentJson(json),
    lines,
    steps: verdictAt,
    tree,
  };
}

/** Returns the opening caption: the kit's title and the shape of its tree. */
function describeKit(kit: KitModel, evaluated: EvaluatedCheck[]): string {
  const nestedCount = evaluated.filter(({ result }) => result.depth > 0).length;
  const nested = nestedCount > 0 ? `, ${nestedCount} of them nested` : '';
  const checklists = kit.checklists.length > 1 ? `, in ${kit.checklists.length} checklists` : '';
  return `${kit.title}: ${evaluated.length} checks${nested}${checklists}`;
}

/** Returns the verdict step's caption. */
function describeVerdict(worstSeverity: Severity | null, passed: boolean): string {
  if (!passed) return '<code>fail-on: error</code>: the error fails the run, exit 1';
  if (worstSeverity !== null)
    return '<code>fail-on: error</code>: nothing failed at error, so the run passes with exit 0';
  return 'Nothing to fix: the run passes with exit 0';
}

/**
 * Returns a checklist's checks in tree order, each at the step after `stepBefore` plus its position.
 *
 * A check is blocked when an ancestor did not pass, skipped when the model declares it `na`, and otherwise passes
 * when its condition is absent or on in `env`, failing at its severity when not.
 */
function evaluateChecklist(checklist: ChecklistModel, env: Environment, stepBefore: number): EvaluatedCheck[] {
  const evaluated: EvaluatedCheck[] = [];

  /** Evaluates one check and then its children, depth first. */
  function visit(check: CheckModel, depth: number, isBlocked: boolean): void {
    const status = resolveStatus(check, env, isBlocked);
    evaluated.push({ at: stepBefore + evaluated.length + 1, check, result: buildResult(check, depth, status), status });
    const children = check.checks ?? [];
    for (const child of children) visit(child, depth + 1, status !== 'pass');
  }

  for (const check of checklist.checks) visit(check, 0, false);
  return evaluated;
}

/** Returns compact JSON text indented by two spaces for display. */
function indentJson(json: string): string {
  const parsed: unknown = JSON.parse(json);
  return JSON.stringify(parsed, undefined, 2);
}

/** Returns the token for a result, by the rule that `reportRdy` applies to a check line. */
function resolveResultToken(result: RdyResult): TokenName {
  if (result.status === 'passed') return 'passed';
  if (result.status === 'skipped') {
    return result.skipReason === 'precondition' ? 'blockedPrecondition' : 'skippedOptional';
  }
  return resolveWorstToken(result.severity);
}

/** Returns a check's outcome in `env`, given whether an ancestor kept it from running. */
function resolveStatus(check: CheckModel, env: Environment, isBlocked: boolean): Status {
  if (isBlocked) return 'blocked';
  if (check.na !== undefined) return 'skip';
  return check.when === undefined || env[check.when] === true ? 'pass' : check.severity;
}

// endregion | Helpers
