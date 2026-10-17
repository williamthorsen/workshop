import type { RdyReport, RdyResult } from '../../kits/types.ts';

/** Returns the index of the first output line containing `needle`, or -1. */
export function indexNaming(output: string, needle: string): number {
  return output.split('\n').findIndex((candidate) => candidate.includes(needle));
}

/** Returns the first output line containing `needle`, throwing when no line does. */
export function lineNaming(output: string, needle: string): string {
  const line = output.split('\n').find((candidate) => candidate.includes(needle));
  if (line === undefined) throw new Error(`No line naming ${JSON.stringify(needle)} in:\n${output}`);
  return line;
}

/** Builds a passing report of a 100 ms run without any results, with any field overridden. */
export function makeReport(overrides?: Partial<RdyReport> & { results?: RdyResult[] }): RdyReport {
  return {
    results: [],
    passed: true,
    durationMs: 100,
    ...overrides,
  };
}
