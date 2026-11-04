/**
 * Finds the trust entries in a recorded `npm trust list --json` transcript. The transcript may also contain npm's
 * approval prompt (a JSON object of its own), prose, echoed input, carriage returns, and escape sequences; every
 * top-level JSON value is parsed, and the objects that have a string `id` are kept. An object with a string
 * `repository` is a GitHub entry, and any other is counted in `otherCount`.
 */
export function parseTrustListing(transcript: string): TrustListing {
  const entries: TrustEntry[] = [];
  let otherCount = 0;

  const items = findJsonValues(stripTerminalControls(transcript)).flatMap((value): unknown[] =>
    Array.isArray(value) ? (value satisfies unknown[]) : [value],
  );

  for (const item of items) {
    if (!isRecord(item) || typeof item['id'] !== 'string') continue;

    const entry = readGithubEntry(item);
    if (entry === undefined) {
      otherCount += 1;
    } else {
      entries.push(entry);
    }
  }

  return { entries, otherCount };
}

/** Removes escape sequences, carriage returns, and other control characters, keeping newlines and tabs. */
export function stripTerminalControls(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- matching terminal escape sequences is the purpose.
      .replaceAll(/\u{1B}\][^\u{7}\u{1B}]*(?:\u{7}|\u{1B}\\)|\u{1B}\[[\d;?]*[ -/]*[@-~]|\u{1B}[@-_]/gu, '')
      // eslint-disable-next-line no-control-regex -- matching control characters is the purpose.
      .replaceAll(/[\u{0}-\u{8}\u{B}-\u{1F}\u{7F}]/gu, '')
  );
}

/** A GitHub trusted publisher as `npm trust list --json` describes it. */
export interface TrustEntry {
  readonly environment?: string;
  readonly file?: string;
  readonly id: string;
  readonly permissions: readonly string[];
  readonly repository: string;
}

/** The trust entries found in a listing, and the count of entries that are not GitHub ones. */
export interface TrustListing {
  readonly entries: readonly TrustEntry[];
  readonly otherCount: number;
}

// region | Helpers

/**
 * Returns the index of the bracket that closes the value opened at `start`, ignoring brackets inside JSON strings,
 * or -1 when the text ends first.
 */
function findClosingIndex(text: string, start: number): number {
  let depth = 0;
  let inString = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }

    switch (char) {
      case '"':
        inString = true;
        break;
      case '[':
      case '{':
        depth += 1;
        break;
      case ']':
      case '}':
        depth -= 1;
        if (depth === 0) return index;
        break;
    }
  }

  return -1;
}

/** Parses each top-level JSON object or array in a text, skipping any span that does not parse. */
function findJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char !== '{' && char !== '[') {
      index += 1;
      continue;
    }

    const end = findClosingIndex(text, index);
    const parsed = end === -1 ? undefined : tryParse(text.slice(index, end + 1));
    if (parsed === undefined) {
      index += 1;
    } else {
      values.push(parsed.value);
      index = end + 1;
    }
  }

  return values;
}

/** Reports whether a value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads a listed object as a GitHub entry, or returns undefined when it has no string `repository`. */
function readGithubEntry(item: Record<string, unknown>): TrustEntry | undefined {
  const { environment, file, id, permissions, repository } = item;
  if (typeof id !== 'string' || typeof repository !== 'string') return undefined;

  return {
    ...(typeof environment === 'string' && environment !== '' && { environment }),
    ...(typeof file === 'string' && file !== '' && { file }),
    id,
    permissions: Array.isArray(permissions) ? permissions.filter((permission) => typeof permission === 'string') : [],
    repository,
  };
}

/** Parses a JSON text, wrapping the result so that a parsed `null` stays distinguishable from a failure. */
function tryParse(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

// endregion | Helpers
