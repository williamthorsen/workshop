import { afterEach, describe, expect, it, vi } from 'vitest';

import { runForce } from '../force.ts';
import { mockCapturedStatus, mockStreamedRun } from '../test-utils/chezmoi-mocks.ts';

const context = { source: '/src', target: '/target' };

describe(runForce, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a full apply and reports M rows as forced, exiting 0 on success', async () => {
    mockCapturedStatus(' A .new\n M .diff\n D .gone\n R normalize.sh\n');
    const apply = mockStreamedRun(0);

    const result = await runForce(context);

    expect(result.exitCode).toBe(0);
    expect(result.counts).toStrictEqual({ created: 1, deleted: 1, forced: 1, conflicts: 0, pending: 0 });
    expect(result.entries).toContainEqual({ path: '.diff', outcome: 'forced' });
    expect(apply).toHaveBeenCalledWith(context, ['apply']);
  });

  it('maps a non-zero apply (script failure) to exit 2', async () => {
    mockCapturedStatus(' R failing.sh\n');
    mockStreamedRun(1);

    const result = await runForce(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('never reports conflicts under force', async () => {
    mockCapturedStatus(' M .diff\n');
    mockStreamedRun(0);

    const result = await runForce(context);

    expect(result.counts.conflicts).toBe(0);
    expect(result.entries.every((entry) => entry.outcome !== 'conflict')).toBe(true);
  });
});
