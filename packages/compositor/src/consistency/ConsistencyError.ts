import type { Violation } from './Violation.ts';

/**
 * Raised when a structurally valid document contradicts itself.
 *
 * Published so a consumer validating both a plan and a catalog catches one type rather than naming each subclass. The
 * subject word composes the message, which is what lets each subclass keep the wording it had before this base existed.
 */
export class ConsistencyError extends Error {
  override readonly name: string = 'ConsistencyError';
  readonly violations: ReadonlyArray<Violation>;

  constructor(subject: string, violations: ReadonlyArray<Violation>) {
    super(`${subject} is inconsistent:\n${violations.map(({ path, message }) => `  ${path} ${message}`).join('\n')}`);
    this.violations = violations;
  }
}
