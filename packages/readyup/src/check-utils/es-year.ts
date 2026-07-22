/** ECMAScript language level, lowercased to match the `lib` and `target` values a tsconfig reader returns. */
export type EsYear = 'es2022' | 'es2023' | 'es2024' | 'es2025';

/** Node LTS major versions and the ECMAScript year each one supports. */
const ES_YEAR_BY_NODE_MAJOR: Readonly<Record<number, EsYear>> = {
  18: 'es2022',
  20: 'es2023',
  22: 'es2024',
  24: 'es2025',
};

/**
 * Maps a Node major version to the ECMAScript year it supports.
 * Returns undefined for majors outside the table, leaving the caller to decide what an unrecognized major means.
 */
export function esYearForNodeMajor(major: number): EsYear | undefined {
  return ES_YEAR_BY_NODE_MAJOR[major];
}
