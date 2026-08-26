import type { Severity, SummaryCounts } from '../kits/types.ts';
import { pluralizeWithCount } from '../portable/pluralize.ts';
import type { Formatter, HeadingLevel, TokenName } from './formatter.ts';

/** Milliseconds below which a line omits its duration, leaving only timings worth reading. */
const DURATION_FLOOR_MS = 100;

/** Rule characters in a heading's leading sigil. */
const HEADING_SIGIL_WIDTH = 2;

/**
 * Text separating one breadcrumb segment from the next.
 *
 * Spaced on both sides because a segment's own text contains slashes -- a scoped package name, a relative
 * path -- and under a style whose roles have no glyph, that spacing is the only boundary a reader gets.
 */
export const SEGMENT_SEPARATOR = ' / ';

/** Columns between one summary-table cell and the next. */
const TABLE_CELL_GAP = '  ';

/**
 * Label leading every count line.
 *
 * The word is what tells a count line apart from the check lines above it: both lead with a severity
 * token in the same column, so the tally needs to name itself rather than rely on the glyph.
 */
const TOTAL_LABEL = 'Total:';

/** Heading over the combined summary table. */
const SUMMARY_HEADING = 'Summary';

/** Text separating one count from the next. */
const COUNT_SEPARATOR = ', ';

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
 * Ordered by outcome rather than alphabetically: the checks that ran, worst news first, then the checks
 * that did not. The reader scans left to right and meets the failures before anything else, and a fixed
 * order is what lets them find a field without reading every label.
 */
const COUNT_FIELDS: readonly CountField[] = [
  { key: 'errors', singular: 'error', plural: 'errors' },
  { key: 'warnings', singular: 'warning', plural: 'warnings' },
  { key: 'recommendations', singular: 'recommendation', plural: 'recommendations' },
  { key: 'passed', singular: 'passed', plural: 'passed' },
  { key: 'blocked', singular: 'blocked', plural: 'blocked' },
  { key: 'optional', singular: 'skipped', plural: 'skipped' },
];

/** One segment of a breadcrumb heading: the role the name plays, and the name itself. */
export interface BreadcrumbSegment {
  role: TokenName;
  text: string;
}

/** A check line's content. Every geometric decision made from it belongs to the engine. */
export interface CheckLineInput {
  token: TokenName;
  name: string;
  checkId?: string | undefined;
  depth?: number | undefined;
  detail?: string | undefined;
  durationMs?: number | undefined;
  progress?: string | undefined;
}

/** One checklist's row in the combined summary table. */
export interface SummaryRow {
  counts: SummaryCounts;
  durationMs: number;
  segments: BreadcrumbSegment[];
}

/** The combined summary table's rows alongside the totals its final line reports. */
export interface SummaryTableInput {
  rows: SummaryRow[];
  totalDurationMs: number;
  totals: SummaryCounts;
}

/** String builders that lay out a formatter's tokens. */
export interface LayoutEngine {
  formatBreadcrumb(segments: BreadcrumbSegment[], level: HeadingLevel, detail?: string): string;
  formatBreadcrumbLabel(segments: BreadcrumbSegment[]): string;
  formatCheckLine(input: CheckLineInput): string;
  formatCountLine(counts: SummaryCounts, durationMs: number): string;
  formatCounts(counts: SummaryCounts): string;
  formatHeading(name: string, level: HeadingLevel, detail?: string): string;
  formatHint(hint: string): string;
  formatReasonBlock(reasons: string[], depth?: number): string[];
  formatSummaryTable(input: SummaryTableInput): string[];
  indent(depth: number): string;
  inlineGlyph(token: TokenName): string;
  token(token: TokenName): string;
}

/** Returns string builders bound to `formatter`, each deriving its spacing from the formatter's gutter. */
export function createLayoutEngine(formatter: Formatter): LayoutEngine {
  /**
   * Returns `segments` as one heading, each behind its role's glyph and separated by the segment separator.
   *
   * A role the formatter gives no glyph closes up, with no space where the glyph would sit.
   */
  function formatBreadcrumb(segments: BreadcrumbSegment[], level: HeadingLevel, detail?: string): string {
    const rendered = segments.map((segment) => `${inlineGlyph(segment.role)}${segment.text}`);
    return formatHeading(rendered.join(SEGMENT_SEPARATOR), level, detail);
  }

  /**
   * Returns one line, `token name <separator> detail [id] [progress] (duration)`, dropping the segments it lacks.
   *
   * The separator is the formatter's, so the shape holds across styles while the punctuation varies.
   */
  function formatCheckLine(input: CheckLineInput): string {
    const segments = [`${indent(input.depth ?? 0)}${token(input.token)}${input.name}`];
    if (input.detail !== undefined) segments.push(`${formatter.detailSeparator} ${input.detail}`);
    if (input.checkId !== undefined) segments.push(`[${input.checkId}]`);
    if (input.progress !== undefined) segments.push(`[${input.progress}]`);

    const duration = resolveDuration(input.token, input.durationMs);
    if (duration !== undefined) segments.push(`(${duration})`);

    return segments.join(' ');
  }

  /**
   * Returns `token Total: counts (duration)`, led by the token for `counts.worstSeverity`.
   *
   * The duration always appears, whatever its magnitude.
   */
  function formatCountLine(counts: SummaryCounts, durationMs: number): string {
    return token(resolveWorstToken(counts.worstSeverity)) + buildCountBody(counts, durationMs);
  }

  /**
   * Returns `name` behind a two-character rule whose weight comes from `level`, with `detail` behind
   * the formatter's separator where there is one.
   *
   * A heading has no blank line of its own. Separation is a property of the sequence a heading sits
   * in, which only the code emitting that sequence can see: a heading deciding for itself is how two
   * adjacent ones each contribute a blank and open a gap neither intended.
   */
  function formatHeading(name: string, level: HeadingLevel, detail?: string): string {
    const suffix = detail === undefined ? '' : ` ${formatter.detailSeparator} ${detail}`;
    return `${formatter.rules[level].repeat(HEADING_SIGIL_WIDTH)} ${name}${suffix}`;
  }

  /** Returns a remediation hint behind the formatter's prefix, as one line of its own. */
  function formatHint(hint: string): string {
    return `${formatter.hintPrefix} ${hint}`;
  }

  /**
   * Returns each reason indented to the name column of a check at `depth`, one gutter further in.
   *
   * A reason with its own line breaks -- a bundler's rendered diagnostic, say -- is indented on
   * every line, so it reads as one block rather than falling back to the left margin partway through.
   * Blank lines within it stay blank rather than becoming trailing whitespace.
   */
  function formatReasonBlock(reasons: string[], depth = 0): string[] {
    const gutter = indent(depth + 1);
    return reasons.map((reason) =>
      reason
        .split('\n')
        .map((line) => (line === '' ? line : `${gutter}${line}`))
        .join('\n'),
    );
  }

  /**
   * Returns the summary table's lines: a heading, a rule, one line per row, a closing rule, and a total.
   *
   * Names are padded and durations right-aligned, so every row's counts begin at the same column. Both
   * rules span the widest line they enclose, the total included. A row names itself by its breadcrumb
   * without the role glyphs the matching heading adds, because padding counts characters while the
   * terminal lays out display width, and a glyph makes the two disagree.
   */
  function formatSummaryTable({ rows, totalDurationMs, totals }: SummaryTableInput): string[] {
    const named = rows.map((row) => ({ ...row, name: formatBreadcrumbLabel(row.segments) }));
    const nameWidth = Math.max(...named.map((row) => row.name.length));
    const durationWidth = Math.max(...named.map((row) => formatDuration(row.durationMs).length));

    const entries = named.map((row) => ({
      token: resolveWorstToken(row.counts.worstSeverity),
      body: [
        row.name.padEnd(nameWidth),
        formatDuration(row.durationMs).padStart(durationWidth),
        formatCounts(row.counts),
      ].join(TABLE_CELL_GAP),
    }));
    const totalBody = buildCountBody(totals, totalDurationMs);

    const bodyWidth = Math.max(...entries.map((entry) => entry.body.length), totalBody.length);
    const rule = formatter.rules.section.repeat(formatter.gutter + bodyWidth);

    return [
      formatHeading(SUMMARY_HEADING, 'kit'),
      rule,
      ...entries.map((entry) => `${token(entry.token)}${entry.body}`),
      rule,
      `${token(resolveWorstToken(totals.worstSeverity))}${totalBody}`,
    ];
  }

  /** Returns `depth` gutters' worth of spaces. */
  function indent(depth: number): string {
    return ' '.repeat(formatter.gutter * depth);
  }

  /**
   * Returns a token's glyph and one trailing space, for placement mid-sentence rather than at a line's head.
   *
   * A formatter that gives the token no glyph returns an empty string, so the sentence closes up with no space.
   */
  function inlineGlyph(name: TokenName): string {
    const { glyph } = formatter.tokens[name];
    return glyph === '' ? '' : `${glyph} `;
  }

  /** Returns a token's glyph padded to the gutter, so what follows starts at a fixed column. */
  function token(name: TokenName): string {
    const { glyph: character, width } = formatter.tokens[name];
    return character + ' '.repeat(formatter.gutter - width);
  }

  // -- Helpers --

  /** Returns everything a count line shows after its leading token. */
  function buildCountBody(counts: SummaryCounts, durationMs: number): string {
    return `${TOTAL_LABEL} ${formatCounts(counts)} (${formatDuration(durationMs)})`;
  }

  return {
    formatBreadcrumb,
    formatBreadcrumbLabel,
    formatCheckLine,
    formatCountLine,
    formatCounts,
    formatHeading,
    formatHint,
    formatReasonBlock,
    formatSummaryTable,
    indent,
    inlineGlyph,
    token,
  };
}

/** Returns `segments` separated as a heading separates them, without the role glyphs a heading adds. */
function formatBreadcrumbLabel(segments: BreadcrumbSegment[]): string {
  return segments.map((segment) => segment.text).join(SEGMENT_SEPARATOR);
}

/** Returns the token for a severity, or the `passed` token for `null`. */
export function resolveWorstToken(worstSeverity: Severity | null): TokenName {
  if (worstSeverity === 'error') return 'failedError';
  if (worstSeverity === 'warn') return 'failedWarn';
  if (worstSeverity === 'recommend') return 'failedRecommend';
  return 'passed';
}

/** Returns the non-zero counts joined in field order, or `0 passed` when every count is zero. */
function formatCounts(counts: SummaryCounts): string {
  const fields = COUNT_FIELDS.filter((field) => counts[field.key] > 0).map((field) =>
    pluralizeWithCount(counts[field.key], field.singular, field.plural),
  );
  return fields.length > 0 ? fields.join(COUNT_SEPARATOR) : EMPTY_COUNTS;
}

/** Returns the formatted duration, or undefined for a skipped token or a duration under the floor. */
function resolveDuration(token: TokenName, durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || SKIPPED_TOKENS.has(token)) return undefined;
  return durationMs >= DURATION_FLOOR_MS ? formatDuration(durationMs) : undefined;
}

/** Returns a whole number of milliseconds with its unit. */
function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}
