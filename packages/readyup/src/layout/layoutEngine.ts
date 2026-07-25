import type { Severity, SummaryCounts } from '../types.ts';
import { pluralizeWithCount } from '../utils/pluralize.ts';
import type { Formatter, HeadingLevel, TokenName } from './formatter.ts';

/** Milliseconds below which a line omits its duration, leaving only timings worth reading. */
const DURATION_FLOOR_MS = 100;

/** Middle dot, U+00B7. */
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

/** Tokens naming a check that did not run. */
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

/** String builders that lay out a formatter's tokens. */
export interface LayoutEngine {
  formatCheckLine(input: CheckLineInput): string;
  formatCountLine(counts: SummaryCounts, durationMs: number, label?: string): string;
  formatCounts(counts: SummaryCounts): string;
  formatHeading(name: string, level: HeadingLevel): string[];
  formatHeadingLine(name: string, level: HeadingLevel): string;
  formatReasonBlock(reasons: string[], depth?: number): string[];
  formatSummaryTable(input: SummaryTableInput): string[];
  glyph(token: TokenName): string;
  indent(depth: number): string;
  token(token: TokenName): string;
}

/** Returns string builders bound to `formatter`, each deriving its spacing from the formatter's gutter. */
export function createLayoutEngine(formatter: Formatter): LayoutEngine {
  /** Returns one line, `token name · detail [progress] (duration)`, dropping the segments it lacks. */
  function formatCheckLine(input: CheckLineInput): string {
    const segments = [`${indent(input.depth ?? 0)}${token(input.token)}${input.name}`];
    if (input.detail !== undefined) segments.push(`${DETAIL_SEPARATOR} ${input.detail}`);
    if (input.progress !== undefined) segments.push(`[${input.progress}]`);

    const duration = resolveDuration(input.token, input.durationMs);
    if (duration !== undefined) segments.push(`(${duration})`);

    return segments.join(' ');
  }

  /**
   * Returns `token label counts (duration)`, led by the token for `counts.worstSeverity`.
   *
   * The duration always appears, whatever its magnitude.
   */
  function formatCountLine(counts: SummaryCounts, durationMs: number, label?: string): string {
    return token(resolveWorstToken(counts.worstSeverity)) + buildCountBody(counts, durationMs, label);
  }

  /** Returns the heading line preceded and followed by a blank line. */
  function formatHeading(name: string, level: HeadingLevel): string[] {
    return ['', formatHeadingLine(name, level), ''];
  }

  /** Returns `name` behind a two-character rule whose weight comes from `level`, with no surrounding blanks. */
  function formatHeadingLine(name: string, level: HeadingLevel): string {
    return `${formatter.rules[level].repeat(HEADING_SIGIL_WIDTH)} ${name}`;
  }

  /** Returns each reason indented to the name column of a check at `depth`, one gutter further in. */
  function formatReasonBlock(reasons: string[], depth = 0): string[] {
    return reasons.map((reason) => `${indent(depth + 1)}${reason}`);
  }

  /**
   * Returns the summary table's lines: a heading, a rule, one line per row, a closing rule, and a total.
   *
   * Names are padded and durations right-aligned, so every row's counts begin at the same column. Both
   * rules span the widest line they enclose, the total included.
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

  /** Returns a token's glyph unpadded. */
  function glyph(name: TokenName): string {
    return formatter.tokens[name].glyph;
  }

  /** Returns `depth` gutters' worth of spaces. */
  function indent(depth: number): string {
    return ' '.repeat(formatter.gutter * depth);
  }

  /** Returns a token's glyph padded to the gutter, so what follows starts at a fixed column. */
  function token(name: TokenName): string {
    const { glyph: character, width } = formatter.tokens[name];
    return character + ' '.repeat(formatter.gutter - width);
  }

  // -- Helpers --

  /** Returns everything a count line carries after its leading token. */
  function buildCountBody(counts: SummaryCounts, durationMs: number, label?: string): string {
    const prefix = label === undefined ? '' : `${label} `;
    return `${prefix}${formatCounts(counts)} (${formatDuration(durationMs)})`;
  }

  return {
    formatCheckLine,
    formatCountLine,
    formatCounts,
    formatHeading,
    formatHeadingLine,
    formatReasonBlock,
    formatSummaryTable,
    glyph,
    indent,
    token,
  };
}

/** Returns the token for a severity, or the `passed` token for `null`. */
export function resolveWorstToken(worstSeverity: Severity | null): TokenName {
  if (worstSeverity === 'error') return 'failedError';
  if (worstSeverity === 'warn') return 'failedWarn';
  if (worstSeverity === 'recommend') return 'failedRecommend';
  return 'passed';
}

/** Returns the non-zero counts pipe-joined in field order, or `0 passed` when every count is zero. */
function formatCounts(counts: SummaryCounts): string {
  const fields = COUNT_FIELDS.filter((field) => counts[field.key] > 0).map((field) =>
    pluralizeWithCount(counts[field.key], field.singular, field.plural),
  );
  return fields.length > 0 ? fields.join(' | ') : EMPTY_COUNTS;
}

/** Returns the formatted duration, or nothing for a skipped token or a duration under the floor. */
function resolveDuration(token: TokenName, durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || SKIPPED_TOKENS.has(token)) return undefined;
  return durationMs >= DURATION_FLOOR_MS ? formatDuration(durationMs) : undefined;
}

/** Returns a whole number of milliseconds with its unit. */
function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}
