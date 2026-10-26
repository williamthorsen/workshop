import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatIsoTimestamp, formatLocalDate } from '../date-formats.ts';

// 2026-01-02T03:04:05Z
const EPOCH = 1_767_323_045;

describe(formatIsoTimestamp, () => {
  it('formats the instant in UTC, to the second', () => {
    expect(formatIsoTimestamp(EPOCH)).toBe('2026-01-02T03:04:05Z');
  });
});

describe(formatLocalDate, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('formats the date in the local time zone', () => {
    vi.stubEnv('TZ', 'UTC');
    expect(formatLocalDate(EPOCH)).toBe('2026-01-02');
  });

  it('reports the local date where it differs from the UTC one', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(formatLocalDate(EPOCH)).toBe('2026-01-01');
  });
});
