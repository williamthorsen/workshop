import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { CheckOutcome, FindingOutcome, RdyCheck } from '../kits/types.ts';
import { describeValue } from '../portable/describe-value.ts';
import { isRecord } from '../portable/isRecord.ts';
import { resolveCheckIds } from './resolveCheckIds.ts';
import { resolveFindingOutcome } from './resolveFindingOutcome.ts';

/** Describes a `check` return value that expresses no verdict, naming what was expected instead. */
export function describeUninterpretableReturn(raw: unknown): string {
  return `check() returned ${describeValue(raw)}; expected a boolean, an object with a boolean "ok" property, or an object with a "findings" array.`;
}

/**
 * Returns true if a check's return value is a structured outcome.
 *
 * `ok` must be a boolean: a truthy value of any other type is an authoring mistake, not a pass, and
 * treating it as one is how a broken check reports success.
 */
export function isCheckOutcome(raw: unknown): raw is CheckOutcome {
  return isRecord(raw) && typeof raw['ok'] === 'boolean';
}

/**
 * Returns true if a check's return value is a set of located findings.
 *
 * Keyed on an array `findings`, as `isCheckOutcome` is on a boolean `ok`: each arm is recognized by the
 * field it is built around rather than by a tag its author would have to remember to write.
 */
export function isFindingOutcome(raw: unknown): raw is FindingOutcome {
  return isRecord(raw) && Array.isArray(raw['findings']);
}

/**
 * Returns a check's return value with a set of findings resolved into an outcome, and any other value as
 * it came.
 *
 * Which pragmas decline a finding is settled against the check's ids, so the resolution belongs to the run
 * rather than to the check. The runner and the skip diagnosis both read a verdict off the result, and one
 * resolution between them is what keeps a diagnosed skip agreeing with the run it stands in for.
 */
export function resolveCheckReturn(raw: unknown, check: RdyCheck, provenance: KitProvenance | undefined): unknown {
  if (!isFindingOutcome(raw)) return raw;

  return resolveFindingOutcome(raw, resolveCheckIds(check.id, provenance)?.accepted ?? []);
}
