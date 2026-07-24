/** Longest preview rendered before truncation, in characters. */
const MAX_PREVIEW_LENGTH = 40;

/**
 * Name the runtime type of a value.
 *
 * Distinguishes `null` and arrays from plain objects, which `typeof` alone collapses together. Used
 * in diagnostics that tell an author what they wrote where a specific type was expected.
 */
export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Render a short, readable preview of a value for a diagnostic message.
 *
 * Strings keep their quotes, so `"1"` stays distinguishable from `1`. Anything long is truncated:
 * the preview is there to identify what was written, and the author has the source. A value with no
 * useful rendering falls back to its type name, which is all that a function or a circular structure
 * could tell a reader anyway.
 */
export function previewValue(value: unknown): string {
  // The types `JSON.stringify` answers with `undefined` or a throw rather than a rendering.
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

  return rendered.length > MAX_PREVIEW_LENGTH ? `${rendered.slice(0, MAX_PREVIEW_LENGTH)}...` : rendered;
}

/**
 * Name a value by its type and its content, for a diagnostic that has to convey both.
 *
 * The two collapse into one when the preview already names the type, so a value of `undefined`
 * reads as `undefined` rather than `undefined undefined`.
 */
export function describeValue(value: unknown): string {
  const type = describeType(value);
  const preview = previewValue(value);
  return preview === type ? type : `${type} ${preview}`;
}
