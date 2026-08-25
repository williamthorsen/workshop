import type { Violation } from '../consistency/Violation.ts';

/**
 * Raised when a plan is well-formed but names something this engine will not write.
 *
 * Distinct from a consistency fault, which is a plan disagreeing with itself: these plans are coherent, and the engine
 * reading them is what cannot apply them. Every refusal is collected before throwing, so one run reports all of
 * them and the destination is untouched either way.
 */
export class UnapplicablePlanError extends Error {
  override readonly name = 'UnapplicablePlanError';
  readonly refusals: ReadonlyArray<Violation>;

  constructor(refusals: ReadonlyArray<Violation>) {
    super(`Plan cannot be applied:\n${refusals.map(({ path, message }) => `  ${path} ${message}`).join('\n')}`);
    this.refusals = refusals;
  }
}
