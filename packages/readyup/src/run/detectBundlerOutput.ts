/** The evidence on which a source is judged bundler output. */
export type BundlerSignal = 'density' | 'header';

/**
 * Mean line length above which a source is judged minified. Committed bundles measured 685 characters per line and
 * up, and hand-written sources at most 94, so the threshold sits well clear of both.
 */
export const MEAN_LINE_LENGTH_THRESHOLD = 250;

/** Size below which the density signal is not applied, since one long line dominates a short file's mean. */
const DENSITY_MIN_LENGTH = 1_000;

/** How many opening lines are searched for a bundler's runtime helpers. */
const HELPER_LINE_COUNT = 20;

/** How many opening lines are searched for an `@generated` marker. */
const MARKER_LINE_COUNT = 5;

/**
 * Lines that a bundler emits at the head of an unminified bundle. Each is anchored to the line's start, where the
 * bundler writes it, so that hand-written code quoting one in a string or a comment does not match.
 */
const BUNDLER_HELPERS = [
  // esbuild's runtime helper declarations.
  /^var __(?:commonJS|defProp|toESM) = /,
  // webpack's bootstrap, every line of which opens with this marker.
  /^\/\*{6}\/ /,
];

/** A comment line containing the `@generated` marker by which code generators label their output. */
const GENERATED_MARKER = /^\s*(?:\/\/|\/\*|\*).*@generated/;

/**
 * Returns the signal by which a source looks like bundler output, or `undefined` when it shows neither.
 *
 * The header is checked first: It names a specific bundler or generator, where density only implies one.
 */
export function detectBundlerOutput(text: string): BundlerSignal | undefined {
  const lines = splitLines(text);

  if (hasBundlerHeader(lines)) return 'header';
  if (text.length >= DENSITY_MIN_LENGTH && measureMeanLineLength(lines) > MEAN_LINE_LENGTH_THRESHOLD) {
    return 'density';
  }
  return undefined;
}

// region | Helpers

/** Reports whether the opening lines contain a bundler's runtime helpers or a generator's marker. */
function hasBundlerHeader(lines: readonly string[]): boolean {
  const helperLines = lines.slice(0, HELPER_LINE_COUNT);
  if (helperLines.some((line) => BUNDLER_HELPERS.some((helper) => helper.test(line)))) return true;

  return lines.slice(0, MARKER_LINE_COUNT).some((line) => GENERATED_MARKER.test(line));
}

/** Returns the mean length of the lines, terminators excluded. */
function measureMeanLineLength(lines: readonly string[]): number {
  if (lines.length === 0) return 0;

  const total = lines.reduce((sum, line) => sum + line.length, 0);
  return total / lines.length;
}

/** Splits text into lines, so that a final terminator does not add an empty line. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

// endregion | Helpers
