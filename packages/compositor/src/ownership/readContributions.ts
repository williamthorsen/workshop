/**
 * The regular-expression sources locating a contribution's markers, each holding exactly one capture group: the key
 * naming which contributor the block belongs to.
 *
 * Patterns rather than literal marker pairs, because a caller supplying literals could only confirm contributions it
 * already knew about, and the question worth asking of a host is which contributions it contains. They are sources
 * rather than compiled expressions so that a consumer's declaration stays serializable.
 *
 * Anchor each pattern to its line with `^` and `$`. Both compile multiline, so those anchors bind to a line rather
 * than to the whole host, and anchoring is what keeps a marker quoted inside prose from reading as one -- the same
 * property `classifyRegion` gives a region's own markers.
 */
export interface ContributionPatterns {
  readonly open: string;
  readonly close: string;
}

/** One contribution a host contains: the key its markers captured, and the body between them. */
export interface Contribution {
  readonly key: string;
  readonly body: string;
}

/**
 * Reads the contributions `content` contains, in document order.
 *
 * A block counts only when an open marker is followed by a close marker capturing the same key, which is what keeps a
 * half-written block from reading as a contribution. Each close marker is claimed once, so the nearest unclaimed one
 * closes the block that opened first.
 *
 * The bodies round-trip through `renderContribution`, whose markers a caller is responsible for keeping consistent
 * with the patterns supplied here.
 */
export function readContributions(content: string, patterns: ContributionPatterns): ReadonlyArray<Contribution> {
  const opens = content.matchAll(toGlobalPattern(patterns.open, 'open')).toArray();
  const closes = content.matchAll(toGlobalPattern(patterns.close, 'close')).toArray();

  const contributions: Array<Contribution> = [];
  const claimed = new Set<number>();

  for (const open of opens) {
    const key = open[1];
    if (key === undefined) {
      continue;
    }
    const bodyStart = open.index + open[0].length;
    const close = findClosingMarker(closes, claimed, key, bodyStart);
    if (close === undefined) {
      continue;
    }
    claimed.add(close.index);
    contributions.push({ key, body: content.slice(bodyStart, close.bodyEnd).replace(/^\n/, '').replace(/\n+$/, '') });
  }

  return contributions;
}

// region | Helpers

/** Locates the first unclaimed close marker that follows `bodyStart` and captures `key`. */
function findClosingMarker(
  closes: ReadonlyArray<RegExpExecArray>,
  claimed: ReadonlySet<number>,
  key: string,
  bodyStart: number,
): { index: number; bodyEnd: number } | undefined {
  for (const [index, close] of closes.entries()) {
    if (!claimed.has(index) && close.index >= bodyStart && close[1] === key) {
      return { index, bodyEnd: close.index };
    }
  }
  return undefined;
}

/**
 * Compiles a marker pattern for a whole-host scan, throwing unless it has exactly one capture group.
 *
 * A pattern that does not compile, or that captures a number of things other than the one key, is a fault in the
 * declaration a consumer wrote, so it throws where a damaged host blocks.
 */
function toGlobalPattern(source: string, role: string): RegExp {
  const pattern = new RegExp(source, 'gm');
  const groupCount = (new RegExp(`${source}|`).exec('') ?? []).length - 1;
  if (groupCount !== 1) {
    throw new Error(
      `A contribution's ${role} pattern must have exactly one capture group naming the contributor, but "${source}" has ${groupCount}.`,
    );
  }
  return pattern;
}

// endregion | Helpers
