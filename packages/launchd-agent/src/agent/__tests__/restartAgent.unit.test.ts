import { describe, expect, it, vi } from 'vitest';

import { runLaunchctl } from '../../launchctl/runLaunchctl.ts';
import { buildLaunchctlRun } from '../../test-utils/buildLaunchctlRun.ts';
import { restartAgent } from '../restartAgent.ts';

vi.mock('../../launchctl/runLaunchctl.ts', () => ({ runLaunchctl: vi.fn() }));

describe(restartAgent, () => {
  it('kills and restarts the agent through kickstart', async () => {
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(0));

    await restartAgent('dev.example.agent');

    expect(vi.mocked(runLaunchctl).mock.lastCall?.[0]).toStrictEqual([
      'kickstart',
      '-k',
      expect.stringMatching(/^gui\/\d*\/dev\.example\.agent$/),
    ]);
  });

  it("rejects with launchctl's diagnosis when kickstart is refused", async () => {
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(113, 'Could not find service\n'));

    await expect(restartAgent('dev.example.agent')).rejects.toThrow(
      'launchctl kickstart failed: Could not find service',
    );
  });
});
