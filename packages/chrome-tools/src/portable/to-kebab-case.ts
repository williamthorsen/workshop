/**
 * Converts a string to kebab case: lowercases it, turns each run of whitespace, `.`, `_`, and `/` into one `-`,
 * collapses runs of `-`, and trims `-` at both ends. Because `/` folds like any other separator, the result is a single
 * path segment.
 */
export function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[\t\n\v\f\r ._/]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}
