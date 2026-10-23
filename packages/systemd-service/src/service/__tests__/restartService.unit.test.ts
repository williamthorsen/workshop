import { describe, expect, it, vi } from 'vitest';

import { runSystemctl } from '../../systemctl/runSystemctl.ts';
import { buildSystemctlRun } from '../../test-utils/buildSystemctlRun.ts';
import { restartService } from '../restartService.ts';

vi.mock('../../systemctl/runSystemctl.ts', () => ({ runSystemctl: vi.fn() }));

describe(restartService, () => {
  it('restarts the service unit', async () => {
    vi.mocked(runSystemctl).mockResolvedValue(buildSystemctlRun(0));

    await restartService('dev.example');

    expect(runSystemctl).toHaveBeenCalledWith(['restart', 'dev.example.service']);
  });

  it('rejects with the output of a refused restart', async () => {
    vi.mocked(runSystemctl).mockResolvedValue(buildSystemctlRun(5, 'Unit dev.example.service not found.\n'));

    await expect(restartService('dev.example')).rejects.toThrow(
      'systemctl restart failed: Unit dev.example.service not found.',
    );
  });
});
