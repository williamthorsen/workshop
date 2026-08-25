import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockCapturedStatus } from '../test-utils/chezmoi-mocks.ts';
import { runVerify } from '../verify.ts';

const context = { source: '/src', target: '/target' };

describe(runVerify, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits 0 with no entries when status is clean', async () => {
    mockCapturedStatus('');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(0);
    expect(result.entries).toStrictEqual([]);
    expect(result.counts.pending).toBe(0);
  });

  it('reports A/M/D rows as drift and exits 1', async () => {
    mockCapturedStatus(' A .new\n M .diff\n D .gone\n');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(1);
    expect(result.counts.pending).toBe(3);
    expect(result.entries).toStrictEqual([
      { path: '.new', outcome: 'created' },
      { path: '.diff', outcome: 'conflict' },
      { path: '.gone', outcome: 'deleted' },
    ]);
  });

  it('ignores R rows for the verdict and exits 0 when only scripts are pending', async () => {
    mockCapturedStatus(' R normalize.sh\n R seed.sh\n');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(0);
    expect(result.entries).toStrictEqual([]);
    expect(result.scripts).toStrictEqual({ ran: 2, ok: true });
  });

  it('surfaces pending scripts while still failing on file drift', async () => {
    mockCapturedStatus(' A .new\n R normalize.sh\n');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(1);
    expect(result.scripts.ran).toBe(1);
    expect(result.counts.pending).toBe(1);
  });
});
