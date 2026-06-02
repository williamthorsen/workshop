import { afterEach, describe, expect, it, vi } from 'vitest';

import * as runChezmoiModule from '../../chezmoi/runChezmoi.ts';
import { runForce } from '../force.ts';

const context = { source: '/src', target: '/target' };

function mockStatus(stdout: string): void {
  vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({ stdout, stderr: '', code: 0 });
}

function mockApply(code: number): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(runChezmoiModule, 'runChezmoiStreamed').mockResolvedValue(code);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe(runForce, () => {
  it('runs a full apply and reports M rows as forced, exiting 0 on success', async () => {
    mockStatus(' A .new\n M .diff\n D .gone\n R normalize.sh\n');
    const apply = mockApply(0);

    const result = await runForce(context);

    expect(result.exitCode).toBe(0);
    expect(result.counts).toStrictEqual({ created: 1, deleted: 1, forced: 1, conflicts: 0, pending: 0 });
    expect(result.entries).toContainEqual({ path: '.diff', outcome: 'forced' });
    expect(apply).toHaveBeenCalledWith(context, ['apply']);
  });

  it('maps a non-zero apply (script failure) to exit 2', async () => {
    mockStatus(' R failing.sh\n');
    mockApply(1);

    const result = await runForce(context);

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });

  it('never reports conflicts under force', async () => {
    mockStatus(' M .diff\n');
    mockApply(0);

    const result = await runForce(context);

    expect(result.counts.conflicts).toBe(0);
    expect(result.entries.every((entry) => entry.outcome !== 'conflict')).toBe(true);
  });
});
