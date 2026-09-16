/** Longest preview rendered before truncation, in UTF-16 code units. */
const MAX_PREVIEW_LENGTH = 40;

/**
 * Names the runtime type of a value.
 *
 * Distinguishes `null` and arrays from plain objects, which `typeof` alone collapses together.
 */
export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Returns a short, readable preview of a value for a diagnostic message.
 *
 * Strings keep their quotes, so `"1"` stays distinguishable from `1`. Anything long is truncated:
 * the preview is there to identify what was written, and the author has the source. A value with no
 * useful rendering falls back to its type name, which is all that a function or a circular structure
 * could tell a reader anyway.
 */
export function previewValue(value: unknown): string {
  // The types for which `JSON.stringify` yields `undefined` or throws rather than rendering.
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'function';
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'bigint') return `${value}n`;

  let rendered: string;
  try {
    rendered = JSON.stringify(value);
  } catch {
    return describeType(value);
  }

  return rendered.length > MAX_PREVIEW_LENGTH
    ? `${truncateAtClusterBoundary(rendered, MAX_PREVIEW_LENGTH)}...`
    : rendered;
}

/**
 * Names a value by its type and its content, for a diagnostic that has to convey both.
 *
 * The two collapse into one when the preview already names the type, so a value of `undefined`
 * reads as `undefined` rather than `undefined undefined`.
 */
export function describeValue(value: unknown): string {
  const type = describeType(value);
  const preview = previewValue(value);
  return preview === type ? type : `${type} ${preview}`;
}

// region | Helpers

/**
 * Returns the longest prefix of `text` that fits `limit` UTF-16 code units without splitting a grapheme cluster.
 *
 * A cluster split across the cut renders as a replacement character. A cluster that alone exceeds
 * `limit` yields an empty prefix, which keeps the result bounded.
 */
function truncateAtClusterBoundary(text: string, limit: number): string {
  // A fixed locale keeps the result independent of the host default; grapheme segmentation carries no tailoring.
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  let end = 0;
  for (const { index, segment } of segmenter.segment(text)) {
    if (index + segment.length > limit) break;
    end = index + segment.length;
  }
  return text.slice(0, end);
}

// endregion | Helpers
