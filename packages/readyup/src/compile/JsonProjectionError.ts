import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * Why a JSON file could not be projected onto a path specifier.
 *
 * `unreadable` and `invalid-json` describe the file. `not-an-object` and `path-not-found` describe the
 * projection, which is what lets a reader report a file that is present and well-formed while the fields
 * a kit pinned to are gone.
 */
export type JsonProjectionFailure = 'invalid-json' | 'not-an-object' | 'path-not-found' | 'unreadable';

/** Optional fields accepted by the `JsonProjectionError` constructor. */
export interface JsonProjectionErrorOptions {
  cause?: unknown;

  /** What the failure found, where `reason` alone does not say it: the root's type, or the key path. */
  detail?: string | undefined;
}

/**
 * A JSON file that could not be projected onto a path specifier.
 *
 * `reason` travels separately from `message` so a caller can report the failure in its own wording:
 * `pickJson` names the path as the kit wrote it, while a verdict over a recorded input names the kind
 * of staleness. Holding the diagnosis as data is what keeps both from matching on message text.
 */
export class JsonProjectionError extends Error {
  /** The JSON file, absolute. */
  readonly filePath: string;

  readonly detail: string | undefined;
  readonly reason: JsonProjectionFailure;

  constructor(
    reason: JsonProjectionFailure,
    filePath: string,
    message: string,
    options: JsonProjectionErrorOptions = {},
  ) {
    super(message, ...(options.cause === undefined ? [] : [{ cause: options.cause }]));
    this.name = 'JsonProjectionError';
    this.detail = options.detail;
    this.filePath = filePath;
    this.reason = reason;
  }
}

/**
 * Returns why a JSON file could not be projected, in a form that does not repeat the path beside it.
 *
 * A `JsonProjectionError`'s own message names the file absolutely, which a caller reporting the failure
 * has usually already named as it knows it. Reading the diagnosis off `reason` is what keeps the two
 * from disagreeing about the path.
 */
export function describeJsonProjectionFailure(error: unknown): string {
  if (!(error instanceof JsonProjectionError)) return describeError(error);

  switch (error.reason) {
    case 'invalid-json':
      return 'invalid JSON';
    case 'not-an-object':
      return `expected a JSON object, got ${error.detail ?? 'something else'}`;
    case 'path-not-found':
      return `path not found: ${error.detail ?? 'unknown path'}`;
    case 'unreadable':
      return 'unreadable';
  }
}
