import { describe, expect, it } from 'vitest';

import { createFakeContext } from '../../test-utils/fake-runner.ts';
import { runForce } from '../force.ts';

describe(runForce, () => {
  it('runs a full apply and reports M rows as forced, exiting 0 on success', async () => {
    const context = createFakeContext({ captured: { stdout: ' A .new\n M .diff\n D .gone\n R normalize.sh\n' } });

    const result = await runForce(context);

    expect(result.exitCode).toBe(0);
    expect(result.counts).toStrictEqual({ created: 1, deleted: 1, forced: 1, conflicts: 0, pending: 0 });
    expect(result.entries).toContainEqual({ path: '.diff', outcome: 'forced' });
    expect(context.runner.runStreamed).toHaveBeenCalledWith(context, ['apply']);
  });

  it('maps a non-zero apply (script failure) to exit 2', async () => {
    const context = createFakeContext({ captured: { stdout: ' R failing.sh\n' }, streamedCode: 1 });

    const result = await runForce(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('never reports conflicts under force', async () => {
    const context = createFakeContext({ captured: { stdout: ' M .diff\n' } });

    const result = await runForce(context);

    expect(result.counts.conflicts).toBe(0);
    expect(result.entries.every((entry) => entry.outcome !== 'conflict')).toBe(true);
  });
});
