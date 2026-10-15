import { setTimeout } from 'node:timers/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runLaunchctl } from '../../launchctl/runLaunchctl.ts';
import { buildLaunchctlRun } from '../../test-utils/buildLaunchctlRun.ts';
import { replaceLoadedAgent } from '../replaceLoadedAgent.ts';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));
vi.mock('../../launchctl/runLaunchctl.ts', () => ({ runLaunchctl: vi.fn() }));

const label = 'dev.example.agent';
const plistPath = '/plists/agent.plist';

describe(replaceLoadedAgent, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bootstraps only once launchd has dropped the previous instance', async () => {
    let lingeringPrints = 3;
    vi.mocked(runLaunchctl).mockImplementation(([subcommand]) => {
      if (subcommand !== 'print') return Promise.resolve(buildLaunchctlRun(0));
      return Promise.resolve(lingeringPrints-- > 0 ? buildLaunchctlRun(0, 'state = running') : buildLaunchctlRun(113));
    });

    await replaceLoadedAgent(label, plistPath);

    const subcommands = vi.mocked(runLaunchctl).mock.calls.map(([args]) => args[0]);
    expect(subcommands).toStrictEqual(['bootout', 'print', 'print', 'print', 'print', 'bootstrap']);
    expect(setTimeout).toHaveBeenCalledTimes(3);
    expect(vi.mocked(runLaunchctl).mock.lastCall?.[0].at(-1)).toBe(plistPath);
  });

  it('rejects without bootstrapping when launchd keeps holding the agent', async () => {
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(0, 'state = running'));

    await expect(replaceLoadedAgent(label, plistPath)).rejects.toThrow('after bootout');
    expect(vi.mocked(runLaunchctl).mock.calls.some(([args]) => args[0] === 'bootstrap')).toBe(false);
  });

  it("reports launchctl's diagnosis when the bootstrap fails", async () => {
    vi.mocked(runLaunchctl).mockImplementation(([subcommand]) =>
      Promise.resolve(
        subcommand === 'bootstrap'
          ? buildLaunchctlRun(5, 'Bootstrap failed: 5: Input/output error\n')
          : buildLaunchctlRun(113),
      ),
    );

    await expect(replaceLoadedAgent(label, plistPath)).rejects.toThrow(
      'launchctl bootstrap failed: Bootstrap failed: 5: Input/output error',
    );
  });
});
