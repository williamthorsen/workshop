import type { Severity, SummaryCounts } from '../types.ts';
import { pluralizeWithCount } from '../utils/pluralize.ts';
import type { Formatter, HeadingLevel, TokenName } from './formatter.ts';

/** Milliseconds below which a line omits its duration, leaving only timings worth reading. */
const DURATION_FLOOR_MS = 100;

/** The one separator a line may carry between a name and its inline detail (U+00B7). */
const DETAIL_SEPARATOR = '\u{00B7}';

/** Rule characters in a heading's leading sigil. */
const HEADING_SIGIL_WIDTH = 2;

/** Columns between one summary-table cell and the next. */
const TABLE_CELL_GAP = '  ';

/** Label leading the combined summary table's final line. */
const TOTAL_LABEL = 'Total:';

/** Heading over the combined summary table. */
const SUMMARY_HEADING = 'Summary';

/** Statement a count line makes when there is nothing at all to report. */
const EMPTY_COUNTS = '0 passed';

/** Tokens naming a check that never ran, so no elapsed time describes it. */
const SKIPPED_TOKENS: ReadonlySet<TokenName> = new Set<TokenName>(['blockedPrecondition', 'skippedOptional']);

/** One tallied field of a count line, with the labels its count selects between. */
interface CountField {
  key: keyof Omit<SummaryCounts, 'worstSeverity'>;
  plural: string;
  singular: string;
}

/**
 * Count fields in the order every count line presents them.
 *
 * Ordered by decreasing severity rather than alphabetically: the reader scans left to right for the
 * worst news, and a fixed order is what lets them find a field without reading every label.
 */
const COUNT_FIELDS: readonly CountField[] = [
  { key: 'passed', singular: 'passed', plural: 'passed' },
  { key: 'errors', singular: 'error', plural: 'errors' },
  { key: 'warnings', singular: 'warning', plural: 'warnings' },
  { key: 'recommendations', singular: 'recommendation', plural: 'recommendations' },
  { key: 'blocked', singular: 'blocked', plural: 'blocked' },
  { key: 'optional', singular: 'skipped', plural: 'skipped' },
];

/** A check line's content. Every geometric decision made from it belongs to the engine. */
export interface CheckLineInput {
  token: TokenName;
  name: string;
  depth?: number | undefined;
  detail?: string | undefined;
  durationMs?: number | undefined;
  progress?: string | undefined;
}

/** One checklist's row in the combined summary table. */
export interface SummaryRow {
  counts: SummaryCounts;
  durationMs: number;
  name: string;
}

/** The combined summary table's rows alongside the totals its final line reports. */
export interface SummaryTableInput {
  rows: SummaryRow[];
  totalDurationMs: number;
  totals: SummaryCounts;
}

/** Pure string builders composing a formatter's vocabulary into laid-out lines. */
export interface LayoutEngine {
  formatCheckLine(input: CheckLineInput): string;
  formatCountLine(counts: SummaryCounts, durationMs: number, label?: string): string;
  formatCounts(counts: SummaryCounts): string;
  formatHeading(name: string, level: HeadingLevel): string[];
  formatReasonBlock(reasons: string[], depth?: number): string[];
  formatSummaryTable(input: SummaryTableInput): string[];
  glyph(token: TokenName): string;
  indent(depth: number): string;
  token(token: TokenName): string;
}

/**
 * Build the layout engine for a formatter.
 *
 * Every function it returns is a pure string builder: no I/O, no `process`, no ambient state. Stream
 * selection and the decision of what to render stay with the caller, so one geometry serves the run
 * report, the summary table, and every other command's lines.
 */
export function createLayoutEngine(formatter: Formatter): LayoutEngine {
  /**
   * Compose a check line as `token name · detail [progress] (duration)`.
   *
   * The middle dot is the only detail separator, so progress takes brackets rather than a second one.
   * A failed check passes no `detail`: its reason belongs in the block beneath, where a multi-clause
   * explanation has room an inline tail does not.
   */
  function formatCheckLine(input: CheckLineInput): string {
    const segments = [`${indent(input.depth ?? 0)}${token(input.token)}${input.name}`];
    if (input.detail !== undefined) segments.push(`${DETAIL_SEPARATOR} ${input.detail}`);
    if (input.progress !== undefined) segments.push(`[${input.progress}]`);

    const duration = resolveDuration(input.token, input.durationMs);
    if (duration !== undefined) segments.push(`(${duration})`);

    return segments.join(' ');
  }

  /**
   * Compose a tail or total line: the worst severity's token, the pipe counts, then the duration.
   *
   * Leading with the worst severity is what makes a failed run legible at a glance; the counts say
   * how much of each kind. The duration is unconditional here, unlike on a check line -- how long a
   * whole run took is worth reading however small it is.
   */
  function formatCountLine(counts: SummaryCounts, durationMs: number, label?: string): string {
    return token(resolveWorstToken(counts.worstSeverity)) + buildCountBody(counts, durationMs, label);
  }

  /** Build a heading and the blank lines setting it off, as separate lines for the caller to join. */
  function formatHeading(name: string, level: HeadingLevel): string[] {
    return ['', `${formatter.rules[level].repeat(HEADING_SIGIL_WIDTH)} ${name}`, ''];
  }

  /**
   * Indent reason lines to the name column of a check at `depth`.
   *
   * The indent unit is the gutter, so one further level of indent is exactly where the name above
   * starts -- the reason then reads as continuation of that name rather than as a check of its own.
   */
  function formatReasonBlock(reasons: string[], depth = 0): string[] {
    return reasons.map((reason) => `${indent(depth + 1)}${reason}`);
  }

  /**
   * Build the combined summary table: heading, rules, one row per checklist, then the total line.
   *
   * Names are padded and durations right-aligned so every row's counts start at one column, and both
   * rules are sized to the widest line they enclose -- including the total, which a rule stopping
   * short of would read as unrelated to the table above it.
   */
  function formatSummaryTable({ rows, totalDurationMs, totals }: SummaryTableInput): string[] {
    const nameWidth = Math.max(...rows.map((row) => row.name.length));
    const durationWidth = Math.max(...rows.map((row) => formatDuration(row.durationMs).length));

    const entries = rows.map((row) => ({
      token: resolveWorstToken(row.counts.worstSeverity),
      body: [
        row.name.padEnd(nameWidth),
        formatDuration(row.durationMs).padStart(durationWidth),
        formatCounts(row.counts),
      ].join(TABLE_CELL_GAP),
    }));
    const totalBody = buildCountBody(totals, totalDurationMs, TOTAL_LABEL);

    const bodyWidth = Math.max(...entries.map((entry) => entry.body.length), totalBody.length);
    const rule = formatter.rules.section.repeat(formatter.gutter + bodyWidth);

    return [
      ...formatHeading(SUMMARY_HEADING, 'section'),
      rule,
      ...entries.map((entry) => `${token(entry.token)}${entry.body}`),
      rule,
      `${token(resolveWorstToken(totals.worstSeverity))}${totalBody}`,
    ];
  }

  /** Return a token's bare glyph, for mid-line placement where it names a thing rather than a status. */
  function glyph(name: TokenName): string {
    return formatter.tokens[name].glyph;
  }

  /** Build the leading whitespace for a given nesting depth. */
  function indent(depth: number): string {
    return ' '.repeat(formatter.gutter * depth);
  }

  /** Return a token padded to the gutter, so the name beside it starts at one column every time. */
  function token(name: TokenName): string {
    const { glyph: character, width } = formatter.tokens[name];
    return character + ' '.repeat(formatter.gutter - width);
  }

  // -- Helpers --

  /** Build everything a count line carries after its leading token. */
  function buildCountBody(counts: SummaryCounts, durationMs: number, label?: string): string {
    const prefix = label === undefined ? '' : `${label} `;
    return `${prefix}${formatCounts(counts)} (${formatDuration(durationMs)})`;
  }

  return {
    formatCheckLine,
    formatCountLine,
    formatCounts,
    formatHeading,
    formatReasonBlock,
    formatSummaryTable,
    glyph,
    indent,
    token,
  };
}

/** Map the worst failed severity to its token, falling back to `passed` when nothing failed. */
export function resolveWorstToken(worstSeverity: Severity | null): TokenName {
  if (worstSeverity === 'error') return 'failedError';
  if (worstSeverity === 'warn') return 'failedWarn';
  if (worstSeverity === 'recommend') return 'failedRecommend';
  return 'passed';
}

/**
 * Join the non-zero counts with pipes, in the fixed field order.
 *
 * A run with nothing to report still says `0 passed` rather than collapsing to an empty segment,
 * which would leave a bare token and duration with no statement between them.
 */
function formatCounts(counts: SummaryCounts): string {
  const fields = COUNT_FIELDS.filter((field) => counts[field.key] > 0).map((field) =>
    pluralizeWithCount(counts[field.key], field.singular, field.plural),
  );
  return fields.length > 0 ? fields.join(' | ') : EMPTY_COUNTS;
}

/**
 * Resolve a line's duration text, or nothing when the timing is not worth a reader's attention.
 *
 * A skipped check carries none however long its skip predicate took: the check itself never ran.
 * Below the floor, a duration is noise on every line of a healthy report.
 */
function resolveDuration(token: TokenName, durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || SKIPPED_TOKENS.has(token)) return undefined;
  return durationMs >= DURATION_FLOOR_MS ? formatDuration(durationMs) : undefined;
}

/** Format a duration in milliseconds for display. */
function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}
