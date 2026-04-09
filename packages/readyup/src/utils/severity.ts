import type { Severity } from '../types.ts';

/** Return the more severe of two severity values. `error` > `warn` > `recommend` > `null`. */
export function worseSeverity(current: Severity | null, candidate: Severity | null): Severity | null {
  if (current === 'error' || candidate === 'error') return 'error';
  if (current === 'warn' || candidate === 'warn') return 'warn';
  if (current === 'recommend' || candidate === 'recommend') return 'recommend';
  return null;
}
