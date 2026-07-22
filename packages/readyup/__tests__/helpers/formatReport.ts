import { formatJsonReport, type FormatJsonReportOptions, type KitInput } from '../../src/formatJsonReport.ts';

/**
 * Serialize a report with the run settings a bare `rdy run --json` would resolve.
 *
 * The serializer takes these as required values because no unresolved state reaches it; tests that
 * are not about the settings themselves say so by omitting the override.
 */
export function formatReport(kitInputs: KitInput[], overrides: Partial<FormatJsonReportOptions> = {}): string {
  return formatJsonReport(kitInputs, { detail: 'full', failOn: 'error', reportOn: 'recommend', ...overrides });
}
