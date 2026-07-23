import {
  formatJsonReport,
  type FormatJsonReportOptions,
  type KitInput,
  type KitResultInput,
} from '../../src/formatJsonReport.ts';
import type { JsonKitErrorEntry } from '../../src/schemas/index.ts';

/** A kit input as a test writes it: thresholds optional, filled in from the invocation's flags. */
export type TestKitInput =
  | JsonKitErrorEntry
  | (Omit<KitResultInput, 'failOn' | 'reportOn'> & Partial<Pick<KitResultInput, 'failOn' | 'reportOn'>>);

/**
 * Serialize a report the way the CLI would for an invocation carrying the given flags.
 *
 * An override stands in for its CLI flag: it reaches the top level only when supplied, and resolves
 * against the default to give each kit the threshold that governs it. A kit input that names its own
 * thresholds keeps them, which is how a test expresses a kit that declared one for itself.
 */
export function formatReport(kitInputs: TestKitInput[], overrides: Partial<FormatJsonReportOptions> = {}): string {
  const { detail = 'full', failOn, reportOn, ...rest } = overrides;

  const resolved: KitInput[] = kitInputs.map((input) =>
    'error' in input ? input : { failOn: failOn ?? 'error', reportOn: reportOn ?? 'recommend', ...input },
  );

  return formatJsonReport(resolved, {
    detail,
    ...(failOn !== undefined && { failOn }),
    ...(reportOn !== undefined && { reportOn }),
    ...rest,
  });
}
