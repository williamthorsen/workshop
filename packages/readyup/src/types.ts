// -- Severity --

/** Severity levels for assertive checks, ordered from most to least urgent. */
export type Severity = 'error' | 'warn' | 'recommend';

// -- Skip conditions --

/**
 * Return value from a skip function.
 *
 * - `false`: the check is applicable; run it.
 * - `string`: the check is not applicable; skip it with this reason as detail.
 */
export type SkipResult = false | string;

// -- Check outcomes --

/** Placement of fix messages in the report output. */
export type FixLocation = 'inline' | 'end';

/** Progress expressed as a fraction with passed and total counts. */
export interface FractionProgress {
  type: 'fraction';
  passedCount: number;
  count: number;
}

/** Progress expressed as a percentage. */
export interface PercentProgress {
  type: 'percent';
  percent: number;
}

/** Union of progress representations, discriminated by `type`. */
export type Progress = FractionProgress | PercentProgress;

/** Return true if a progress value uses the percentage representation. */
export function isPercentProgress(progress: Progress): progress is PercentProgress {
  return progress.type === 'percent';
}

/** Structured outcome from a check, carrying diagnostic data alongside the pass/fail status. */
export interface CheckOutcome {
  ok: boolean;
  detail?: string;
  progress?: Progress;
}

/** The value a check function may return (or resolve to). */
export type CheckReturnValue = boolean | CheckOutcome;

// -- Check definition --

/** A single readyup check. */
export interface RdyCheck {
  /** Display name shown in output. */
  name: string;

  /** Assert a condition. Return true/false or a CheckOutcome. */
  check: () => CheckReturnValue | Promise<CheckReturnValue>;

  /**
   * Severity of this check. Determines failure and reporting behavior.
   * Default: kit's `defaultSeverity`, falling back to 'error'.
   */
  severity?: Severity;

  /**
   * Skip condition. When provided, evaluated before the check runs.
   * Return `false` to run the check, or a reason string to skip it.
   */
  skip?: () => SkipResult | Promise<SkipResult>;

  /** Remediation message shown when the check fails. */
  fix?: string;

  /** Dependent checks that run only if this check passes. */
  checks?: RdyCheck[];
}

// -- Results --

/** Shared fields present on every result regardless of outcome. */
interface RdyResultBase {
  /** Check name. */
  name: string;

  /** Resolved severity for this check. */
  severity: Severity;

  /** Diagnostic detail (failure reason, skip reason, or supplementary info). */
  detail: string | null;

  /** Remediation message, carried from the check definition. */
  fix: string | null;

  /** Error thrown by the check function, if any. */
  error: Error | null;

  /** Progress data, if the check reported it. */
  progress: Progress | null;

  /** Wall-clock time to execute the check, in milliseconds. */
  durationMs: number;

  /** Nesting depth (0 for top-level checks). */
  depth: number;
}

/** Result for a check that ran and passed. */
export interface PassedResult extends RdyResultBase {
  status: 'passed';
  ok: true;
}

/** Result for a check that ran and failed. */
export interface FailedResult extends RdyResultBase {
  status: 'failed';
  ok: false;
}

/** Result for a check that was skipped. */
export interface SkippedResult extends RdyResultBase {
  status: 'skipped';
  ok: null;
  /** Why the check was skipped. */
  skipReason: 'n/a' | 'precondition';
}

/**
 * The outcome of running a single check, discriminated by `status`.
 *
 * - `passed`: check ran and the condition was met.
 * - `failed`: check ran and the condition was not met.
 * - `skipped`: check did not run (`skipReason` explains why).
 */
export type RdyResult = PassedResult | FailedResult | SkippedResult;

// -- Reports --

/** Aggregate report from running a single checklist. */
export interface RdyReport {
  /** Individual check results. */
  results: RdyResult[];

  /**
   * True when no check at or above the failure threshold has `ok: false`.
   * Skipped checks do not affect this.
   */
  passed: boolean;

  /** Total wall-clock time for the checklist, in milliseconds. */
  durationMs: number;
}

/**
 * Granular counts of check results by severity and skip reason.
 *
 * `errors`/`warnings`/`recommendations` replace the coarser `failed` bucket;
 * `blocked` (precondition-skipped) and `optional` (n/a-skipped) replace `skipped`.
 * `worstSeverity` is the highest-severity failed bucket (`null` when nothing failed).
 */
export interface SummaryCounts {
  passed: number;
  errors: number;
  warnings: number;
  recommendations: number;
  blocked: number;
  optional: number;
  worstSeverity: Severity | null;
}

/** Per-checklist aggregate for the combined summary table. */
export interface ChecklistSummary extends SummaryCounts {
  name: string;
  durationMs: number;
}

// -- Checklists --

/** A flat checklist where all checks run concurrently. */
export interface RdyChecklist {
  name: string;

  /**
   * Gating checks. If any precondition fails, all downstream checks are skipped.
   *
   * Reporting of precondition results and skipped dependent checks follows the
   * same reporting-threshold rule as all other results: a result appears in
   * output only when its severity is at or above the reporting threshold.
   * Each dependent check's own severity determines whether its skipped entry
   * is shown.
   */
  preconditions?: RdyCheck[];

  checks: RdyCheck[];

  fixLocation?: FixLocation;
}

/** A staged checklist where groups run sequentially; checks within each group run concurrently. */
export interface RdyStagedChecklist {
  name: string;
  preconditions?: RdyCheck[];
  groups: RdyCheck[][];
  fixLocation?: FixLocation;
}

/** Distinguish a flat checklist from a staged checklist by the presence of `checks`. */
export function isFlatChecklist(checklist: RdyChecklist | RdyStagedChecklist): checklist is RdyChecklist {
  return 'checks' in checklist;
}

// -- Kit --

/** A kit of checklists with shared configuration. */
export interface RdyKit {
  /** Checklists in this kit. */
  checklists: Array<RdyChecklist | RdyStagedChecklist>;

  /** Named subsets of checklists. */
  suites?: Record<string, string[]>;

  /**
   * Default severity for checks that don't declare one.
   * Default: 'error'.
   */
  defaultSeverity?: Severity;

  /**
   * Minimum severity at which a failed check causes the run to fail.
   * Default: 'error'.
   */
  failOn?: Severity;

  /**
   * Minimum severity at which results appear in output.
   * Default: 'recommend' (show all assertive results).
   */
  reportOn?: Severity;

  /** Default placement of fix messages across all checklists. */
  fixLocation?: FixLocation;
}

/** Repo-level settings for the rdy CLI (user-facing, all fields optional). */
export interface RdyConfig {
  compile?: {
    srcDir?: string;
    outDir?: string;
    include?: string;
  };
  internal?: {
    dir?: string;
    infix?: string;
  };
}

/** Fully-resolved config with defaults applied, returned by `loadConfig`. */
export interface ResolvedRdyConfig {
  compile: {
    srcDir: string;
    outDir: string;
    include: string | undefined;
  };
  internal: {
    dir: string;
    infix: string | undefined;
  };
}

// -- JSON output --

/**
 * Serialize a RdyResult for JSON output.
 *
 * All fields are non-optional with explicit `null` for absent values. `skipReason` is
 * present on every entry (not just skipped results) so JSON consumers see a uniform shape.
 */
export interface JsonCheckEntry {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  ok: true | false | null;
  severity: Severity;
  skipReason: 'n/a' | 'precondition' | null;
  detail: string | null;
  fix: string | null;
  error: string | null;
  progress: Progress | null;
  durationMs: number;
  checks: JsonCheckEntry[];
}

/** Shape of a single checklist entry in `--json` output. */
export interface JsonChecklistEntry extends SummaryCounts {
  name: string;
  durationMs: number;
  checks: JsonCheckEntry[];
}

/** Per-kit entry in JSON output, grouping checklists with per-kit summary counts. */
export interface JsonKitEntry extends SummaryCounts {
  name: string;
  durationMs: number;
  checklists: JsonChecklistEntry[];
}

/** Top-level shape of `--json` output. */
export interface JsonReport extends SummaryCounts {
  durationMs: number;
  kits: JsonKitEntry[];
}
