import type { Violation } from '../../consistency/Violation.ts';
import type { MarkerPair } from '../../schemas/render-target-schemas.ts';

/**
 * Reports each side of a marker template that does not stand `placeholder`, standing for `subject`, exactly once.
 *
 * Once, not at least once: a contribution marker renders to one pattern with one capture group, so a second
 * placeholder would leave the reader a choice of which capture named the contributor. A filled inlay is attributed from
 * the deployed file alone, so an inlay marker naming no inlay leaves a reader unable to say which one the span belongs
 * to, and one naming two leaves the attribution ambiguous.
 */
export function findPlaceholderFaults(
  template: MarkerPair,
  placeholder: string,
  subject: string,
  path: string,
): Array<Violation> {
  const violations: Array<Violation> = [];
  for (const [role, value] of [
    ['open', template.open],
    ['close', template.close],
  ] as const) {
    const count = value.split(placeholder).length - 1;
    if (count !== 1) {
      violations.push({
        path: `${path}.${role}`,
        message: `stands ${placeholder} ${count} times, but exactly one names the ${subject}`,
      });
    }
  }
  return violations;
}
