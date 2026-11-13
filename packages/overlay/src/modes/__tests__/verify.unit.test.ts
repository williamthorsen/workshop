import { describe, expect, it } from 'vitest';

import { createFakeContext } from '../../test-utils/fake-runner.ts';
import { runVerify } from '../verify.ts';

describe(runVerify, () => {
  it('exits 0 with no entries when status is clean', async () => {
    const context = createFakeContext({ captured: { stdout: '' } });

    const result = await runVerify(context);

    expect(result.exitCode).toBe(0);
    expect(result.entries).toStrictEqual([]);
    expect(result.counts.pending).toBe(0);
  });

  it('reports A/M/D rows as drift and exits 1', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n M .diff\n D .gone\n' } });

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
    const context = createFakeContext({ captured: { stdout: ' R normalize.sh\n R seed.sh\n' } });

    const result = await runVerify(context);

    expect(result.exitCode).toBe(0);
    expect(result.entries).toStrictEqual([]);
    expect(result.scripts).toStrictEqual({ ranCount: 2, ok: true });
  });

  it('surfaces pending scripts while still failing on file drift', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n R normalize.sh\n' } });

    const result = await runVerify(context);

    expect(result.exitCode).toBe(1);
    expect(result.scripts.ranCount).toBe(1);
    expect(result.counts.pending).toBe(1);
  });
});
