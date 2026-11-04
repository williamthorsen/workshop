/**
 * The number of files in a large-listing tree: enough names of `NAME_LENGTH` to list to more than 1 MiB (each takes
 * 241 bytes with its NUL).
 */
export const LARGE_LISTING_FILE_COUNT = 4500;

const NAME_LENGTH = 240;

/**
 * Builds a `createTempTree` spec of empty files under a directory, whose `git ls-files -z` listing exceeds Node's
 * default `spawnSync` buffer of 1 MiB.
 */
export function buildLargeListingTree(dir: string): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: LARGE_LISTING_FILE_COUNT }, (_, index) => [
      `${dir}/${String(index).padStart(4, '0').padEnd(NAME_LENGTH, 'x')}`,
      '',
    ]),
  );
}
