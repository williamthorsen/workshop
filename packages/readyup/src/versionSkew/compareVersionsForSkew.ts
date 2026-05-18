/**
 * Result of comparing a compile-time version against a runtime version.
 *
 * `no-skew` covers identical versions, sub-boundary differences, all-zero
 * compile-time versions, and unparseable inputs (forgiving — matches the
 * absent-field policy used by the warning emitter).
 */
export type SkewResult = { kind: 'no-skew' } | { kind: 'skew'; direction: 'runner-newer' | 'runner-older' };

/** Parsed `MAJOR.MINOR.PATCH` triple (numeric segments only; pre-release suffixes are ignored). */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse the leading `MAJOR.MINOR.PATCH` of a version string into a numeric triple.
 *
 * Strips any pre-release or build suffix (`-beta`, `+sha`). Returns `undefined` when
 * the string does not begin with three dot-separated non-negative integers.
 */
function parseSemverTriple(version: string): ParsedVersion | undefined {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (match === null) return undefined;
  const [majorRaw, minorRaw, patchRaw] = [match[1], match[2], match[3]];
  if (majorRaw === undefined || minorRaw === undefined || patchRaw === undefined) return undefined;
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  const patch = Number(patchRaw);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return undefined;
  return { major, minor, patch };
}

/** Look up a numeric segment by its leftmost-non-zero index (0=major, 1=minor, 2=patch). */
function segmentAt(version: ParsedVersion, index: 0 | 1 | 2): number {
  if (index === 0) return version.major;
  if (index === 1) return version.minor;
  return version.patch;
}

/** Find the leftmost non-zero segment of a parsed version, or `undefined` when all segments are zero. */
function leftmostNonZeroIndex(version: ParsedVersion): 0 | 1 | 2 | undefined {
  if (version.major !== 0) return 0;
  if (version.minor !== 0) return 1;
  if (version.patch !== 0) return 2;
  return undefined;
}

/**
 * Compare a compile-time version against a runtime version using the leftmost-non-zero rule.
 *
 * Matches npm's `^` operator: the leftmost non-zero segment of the compile-time version is the
 * breaking boundary. When that segment differs between the two versions, there is skew; the
 * direction reflects whether the runtime is newer or older.
 *
 * Returns `no-skew` for identical versions, sub-boundary differences, all-zero compile-time
 * versions, and unparseable inputs.
 *
 * When the two versions have different major numbers, direction is determined by the major
 * comparison alone — the boundary-index logic only applies to within-major comparisons, since
 * a lower-segment value in a higher-major version (e.g. `1.0.0` vs `0.20.0`) is semantically
 * newer despite having a numerically smaller minor.
 */
export function compareVersionsForSkew(compileTime: string, runtime: string): SkewResult {
  const compileTimeParsed = parseSemverTriple(compileTime);
  const runtimeParsed = parseSemverTriple(runtime);
  if (compileTimeParsed === undefined || runtimeParsed === undefined) return { kind: 'no-skew' };

  // When majors differ, the major comparison alone determines direction.
  // This guards against the cross-boundary inversion that would otherwise occur when
  // the compile-time boundary index points at a non-major segment.
  if (runtimeParsed.major !== compileTimeParsed.major) {
    return {
      kind: 'skew',
      direction: runtimeParsed.major > compileTimeParsed.major ? 'runner-newer' : 'runner-older',
    };
  }

  const boundaryIndex = leftmostNonZeroIndex(compileTimeParsed);
  if (boundaryIndex === undefined) return { kind: 'no-skew' };

  const compileTimeSegment = segmentAt(compileTimeParsed, boundaryIndex);
  const runtimeSegment = segmentAt(runtimeParsed, boundaryIndex);
  if (runtimeSegment === compileTimeSegment) return { kind: 'no-skew' };

  return {
    kind: 'skew',
    direction: runtimeSegment > compileTimeSegment ? 'runner-newer' : 'runner-older',
  };
}
