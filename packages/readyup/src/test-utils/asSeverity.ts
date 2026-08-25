import type { Severity } from '../kits/types.ts';

/** Restates a string as a severity, standing in for a kit that declared one outside the enum. */
export function asSeverity(value: string): Severity {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the value is one the type forbids.
  return value as Severity;
}
