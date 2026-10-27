import type { Progress, RdyReport, RdyResult, Severity } from '../../src/kits/types.ts';
import { getColor, getLayout, getStyle, setColor, setStyle } from '../../src/layout/engine.ts';
import type { BreadcrumbSegment, SummaryRow } from '../../src/layout/layoutEngine.ts';
import { formatCombinedSummary } from '../../src/reporting/formatCombinedSummary.ts';
import { formatJsonReport } from '../../src/reporting/formatJsonReport.ts';
import { formatRunVerdict } from '../../src/reporting/formatRunVerdict.ts';
import { countResults, renderReportSections } from '../../src/reporting/reportRdy.ts';
import { meetsThreshold } from '../../src/severity/meetsThreshold.ts';
import { DEPLOY_KIT } from './deployKit.ts';
import { CAPTURED_PREFLIGHT, type ChecklistModel, type CheckModel, type KitModel } from './kits.ts';

/** readyup's default failure threshold, at which a run's command omits `--fail-on`. */
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

/**
 * A kit rendered in one environment, each part placed at the step that reveals it.
 *
 * `command` is the kit's command with the flags that produced the run, and `checkSteps` holds the step of each check
 * in tree order across the kit's checklists.
 */
export interface RenderedKit {
  checkSteps: number[];
  command: string;
  exit: 0 | 1;
  exitAt: number;
  json: string;
  lines: TerminalLine[];
  steps: number;
}

/** The flags of a kit's run that a kit page sets; each takes readyup's default when absent. */
export interface RenderOptions {
  failOn?: Severity;
  json?: boolean;
}

/** A check's outcome: the severity at which it failed, or what else became of it. */
type Status = 'blocked' | 'pass' | 'skip' | Severity;

/** A check evaluated in an environment, with the step that reveals it and the result that readyup renders. */
interface EvaluatedCheck {
  at: number;
  result: RdyResult;
}

/**
 * Returns a kit's run in `env` as readyup prints it and as `rdy run --json` prints it, after the command that runs it.
 *
 * Each check takes one step, each checklist's fix recap and count line one more, and the verdict the last.
 */
export function renderKit(kit: KitModel, env: Environment, options: RenderOptions = {}): RenderedKit {
  const previousColor = getColor();
  const previousStyle = getStyle();
  setStyle('rich');
  setColor(true);
  try {
    return composeKit(kit, env, options);
  } finally {
    setStyle(previousStyle);
    setColor(previousColor);
  }
}

/** Returns the terminal lines of the deploy run that "A run, step by step" shows. */
export function renderDeployRun(): TerminalLine[] {
  return renderKit(DEPLOY_KIT, buildDefaultEnvironment(DEPLOY_KIT)).lines;
}

/** Returns the terminal lines of the title slide's run: the captured preflight kit with every condition off. */
export function renderTitleRun(): TerminalLine[] {
  const env = Object.fromEntries(CAPTURED_PREFLIGHT.conditions.map(({ id }) => [id, false]));
  return renderKit(CAPTURED_PREFLIGHT, env).lines;
}

// region | Helpers

/**
 * Returns a kit's command with the flags in `options`, in the form `rdy run {kit} --fail-on={level} --json`; the
 * default threshold adds no flag.
 */
function buildCommand(kit: KitModel, { failOn = FAIL_ON, json = false }: RenderOptions): string {
  return kit.command + (failOn === FAIL_ON ? '' : ` --fail-on=${failOn}`) + (json ? ' --json' : '');
}

/** Returns the environment in which every condition of `kit` takes its declared default. */
function buildDefaultEnvironment(kit: KitModel): Environment {
  return Object.fromEntries(kit.conditions.map((condition) => [condition.id, condition.on]));
}

/**
 * Returns the segments heading a kit's blocks, as a single-kit run builds them: the package or the repository and the
 * kit when the kit came from one, then the checklist when the kit has several.
 */
function buildSegments(kit: KitModel, checklist: ChecklistModel): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];
  if (kit.origin !== undefined) {
    const { source } = kit.origin;
    const version = kit.origin.version === undefined ? '' : `@${kit.origin.version}`;
    const sourceSegment: BreadcrumbSegment = source.startsWith('npm:')
      ? { role: 'sourcePackage', text: `${source.slice('npm:'.length)}${version}` }
      : { role: 'sourceRemote', text: `${source}${version}` };
    segments.push(sourceSegment, { role: 'kit', text: kit.name });
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
    progress: resolveProgress(check, status),
    examinedCount: check.findings === true ? 0 : null,
    durationMs: check.ms ?? 0,
    depth,
  };

  if (status === 'pass') return { ...base, status: 'passed', ok: true, detail: check.detail ?? null };
  if (status === 'skip') return { ...base, status: 'skipped', ok: null, skipReason: 'n/a', detail: check.na ?? null };
  if (status === 'blocked') return { ...base, status: 'skipped', ok: null, skipReason: 'precondition', detail: null };
  const detail = check.sites === undefined ? (check.failDetail ?? null) : check.sites.join(', ');
  return { ...base, status: 'failed', ok: false, detail, fix: check.fix ?? null };
}

/** Composes a kit's run block by block, as `rdy run` writes it after the command, with the deck's steps. */
function composeKit(kit: KitModel, env: Environment, options: RenderOptions): RenderedKit {
  const layout = getLayout();
  const failOn = options.failOn ?? FAIL_ON;
  const command = buildCommand(kit, options);
  const lines: TerminalLine[] = [{ at: 0, printed: false, text: `$ ${command}` }];
  const checkSteps: number[] = [];
  const entries: Array<{ name: string; report: RdyReport }> = [];
  const summaryRows: SummaryRow[] = [];
  let step = 0;

  /** Adds each line of `text`, as rdy prints it, at step `at`. */
  function print(at: number, text: string): void {
    for (const line of text.split('\n')) lines.push({ at, printed: true, text: line });
  }

  for (const [index, checklist] of kit.checklists.entries()) {
    const checks = evaluateChecklist(checklist, env, step);
    step += checks.length;
    checkSteps.push(...checks.map(({ at }) => at));
    const headAt = index === 0 ? 0 : step - checks.length;
    const segments = buildSegments(kit, checklist);

    if (index > 0) print(headAt, '');
    if (segments.length > 0) print(headAt, layout.formatBreadcrumb(segments, 'kit'));

    const results = checks.map(({ result }) => result);
    const report: RdyReport = {
      results,
      passed: results.every((result) => result.status !== 'failed' || !meetsThreshold(result.severity, failOn)),
      durationMs: checklist.ms,
    };
    const sections = renderReportSections(report, { reportOn: REPORT_ON });
    const stepByResult = new Map(checks.map(({ at, result }) => [result, at]));
    for (const { result, lines: resultLines } of sections.results) {
      print(stepByResult.get(result) ?? headAt, resultLines.join('\n'));
    }

    step++;
    print(step, [...sections.fixes, sections.countLine].join('\n'));

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
      kitThresholds: [{ kitName: kit.name, failOn }],
      missingKitCount: 0,
      passed,
      withheld: undefined,
    }),
  );
  lines.push({ at: verdictAt, printed: false, text: `exit ${exit}` });

  const json = formatJsonReport(
    [
      {
        name: kit.name,
        ...(kit.origin !== undefined && { origin: kit.origin }),
        ...(kit.compiledWith !== undefined && { compiledWith: kit.compiledWith }),
        entries,
        failOn,
        reportOn: REPORT_ON,
      },
    ],
    // rdy echoes the threshold at the top level only when the flag was given.
    { detail: 'full', ...(failOn !== FAIL_ON && { failOn }) },
  );

  return { checkSteps, command, exit, exitAt: verdictAt, json: indentJson(json), lines, steps: verdictAt };
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
    evaluated.push({ at: stepBefore + evaluated.length + 1, result: buildResult(check, depth, status) });
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

/**
 * Returns a check's progress fraction, or null when it is blocked or reports none.
 *
 * A findings check that declares `examined` passes every file that it examined unless it fails, in which case each
 * file named among its sites counts once as failing.
 */
function resolveProgress(check: CheckModel, status: Status): Progress | null {
  if (status === 'blocked') return null;
  if (check.examined !== undefined) {
    const failingCount = status === 'pass' ? 0 : new Set(check.sites?.map((site) => site.replace(/:\d+$/u, ''))).size;
    return { type: 'fraction', passedCount: check.examined - failingCount, count: check.examined };
  }
  if (check.progress === undefined) return null;
  return { type: 'fraction', passedCount: check.progress[0], count: check.progress[1] };
}

/** Returns a check's outcome in `env`, given whether an ancestor kept it from running. */
function resolveStatus(check: CheckModel, env: Environment, isBlocked: boolean): Status {
  if (isBlocked) return 'blocked';
  if (check.na !== undefined) return 'skip';
  return check.when === undefined || env[check.when] === true ? 'pass' : check.severity;
}

// endregion | Helpers
