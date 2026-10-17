import type { RdyReport, RdyResult } from '../../kits/types.ts';
import type { TestKitInput } from './formatReport.ts';

/** Wraps a single checklist report as a single-kit input. */
export function buildSingleKitInput(checklistName: string, report: RdyReport): TestKitInput[] {
  return [{ name: 'deploy', entries: [{ name: checklistName, report }] }];
}

/** Builds a passing report of an instant run without any results, with any field overridden. */
export function makeReport(overrides?: Partial<RdyReport> & { results?: RdyResult[] }): RdyReport {
  return { results: [], passed: true, durationMs: 0, ...overrides };
}
