import { isError } from '@williamthorsen/toolbelt.errors';

/** Coerces a thrown value to an Error, wrapping anything that is not one in an Error carrying its text. */
export function toError(value: unknown): Error {
  if (isError(value)) return value;
  return new Error(String(value));
}
