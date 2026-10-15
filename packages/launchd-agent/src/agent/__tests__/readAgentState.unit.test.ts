import { describe, expect, it, vi } from 'vitest';

import { runLaunchctl } from '../../launchctl/runLaunchctl.ts';
import { buildLaunchctlRun } from '../../test-utils/buildLaunchctlRun.ts';
import { readAgentState } from '../readAgentState.ts';

vi.mock('../../launchctl/runLaunchctl.ts', () => ({ runLaunchctl: vi.fn() }));

const label = 'dev.example.agent';

describe(readAgentState, () => {
  it('reports an agent that launchd does not hold as not loaded', async () => {
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(113, 'Could not find service'));

    await expect(readAgentState(label)).resolves.toStrictEqual({ loaded: false });
  });

  it('reports the pid and last exit code of a running agent', async () => {
    const output = `${label} = {\n\tstate = running\n\tpid = 4242\n\tlast exit code = 0\n}\n`;
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(0, output));

    await expect(readAgentState(label)).resolves.toStrictEqual({ lastExitCode: 0, loaded: true, pid: 4_242 });
  });

  it('reports a loaded agent without a running process as having no pid', async () => {
    const output = `${label} = {\n\tstate = not running\n\tlast exit code = 1\n}\n`;
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(0, output));

    await expect(readAgentState(label)).resolves.toStrictEqual({ lastExitCode: 1, loaded: true, pid: undefined });
  });

  it('reports no last exit code for an agent that never exited', async () => {
    const output = `${label} = {\n\tstate = running\n\tpid = 7\n\tlast exit code = (never exited)\n}\n`;
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(0, output));

    await expect(readAgentState(label)).resolves.toStrictEqual({ lastExitCode: undefined, loaded: true, pid: 7 });
  });
});
