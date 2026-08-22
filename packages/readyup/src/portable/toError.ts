import { describeError, isError } from '@williamthorsen/toolbelt.errors';

/**
 * Coerces a thrown value to an Error, wrapping anything else in an Error carrying its text.
 *
 * A value with no rendering, such as a null-prototype object, yields a placeholder rather than throwing, so a catch
 * block reporting a failure cannot itself fail.
 */
export function toError(value: unknown): Error {
  if (isError(value)) return value;
  return new Error(describeError(value));
}
