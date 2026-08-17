import type { CheckOutcome } from '../kits/types.ts';
import { describeValue } from '../portable/describe-value.ts';
import { isRecord } from '../portable/isRecord.ts';

/**
 * Return true if a check's return value is a structured outcome.
 *
 * `ok` must be a boolean: a truthy value of any other type is an authoring mistake, not a pass, and
 * treating it as one is how a broken check reports success.
 */
export function isCheckOutcome(raw: unknown): raw is CheckOutcome {
  return isRecord(raw) && typeof raw['ok'] === 'boolean';
}

/** Describes a `check` return value that expresses no verdict, naming what was expected instead. */
export function describeUninterpretableReturn(raw: unknown): string {
  return `check() returned ${describeValue(raw)}; expected a boolean or an object with a boolean "ok" property.`;
}
