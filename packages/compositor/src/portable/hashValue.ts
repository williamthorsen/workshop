import type { Hash } from '../schemas/scalar-schemas.ts';
import { compareStrings } from './compareStrings.ts';
import { hashUtf8 } from './hash-content.ts';

/**
 * Hashes a JSON-able value over a canonical serialization, so two structurally equal values digest alike.
 *
 * Object keys are sorted and keys holding `undefined` are dropped, which is what lets a config parsed from a file and
 * the same config assembled in memory fingerprint alike however either was built. Array order is content rather than
 * incident, so it is preserved.
 */
export function hashValue(value: unknown): Hash {
  return hashUtf8(JSON.stringify(value, (_key, held: unknown) => (isPlainRecord(held) ? sortKeys(held) : held)) ?? '');
}

// region | Helpers

/** Reports whether `value` is an object whose keys can be reordered without changing what it means. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rebuilds `record` with its keys in order, which is the order `JSON.stringify` then writes them in. */
function sortKeys(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).toSorted(([left], [right]) => compareStrings(left, right)));
}

// endregion | Helpers
