import { afterEach, describe, expect, it, vi } from 'vitest';

import * as runChezmoiModule from '../../chezmoi/runChezmoi.ts';
import { runVerify } from '../verify.ts';

const context = { source: '/src', target: '/target' };

function mockStatus(stdout: string): void {
  vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({ stdout, stderr: '', code: 0 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe(runVerify, () => {
  it('exits 0 with no entries when status is clean', async () => {
    mockStatus('');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(0);
    expect(result.entries).toStrictEqual([]);
    expect(result.counts.pending).toBe(0);
  });

  it('reports A/M/D rows as drift and exits 1', async () => {
    mockStatus(' A .new\n M .diff\n D .gone\n');

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
    mockStatus(' R normalize.sh\n R seed.sh\n');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(0);
    expect(result.entries).toStrictEqual([]);
    expect(result.scripts).toStrictEqual({ ran: 2, ok: true });
  });

  it('surfaces pending scripts while still failing on file drift', async () => {
    mockStatus(' A .new\n R normalize.sh\n');

    const result = await runVerify(context);

    expect(result.exitCode).toBe(1);
    expect(result.scripts.ran).toBe(1);
    expect(result.counts.pending).toBe(1);
  });
});
