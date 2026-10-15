import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runLaunchctl } from '../../launchctl/runLaunchctl.ts';
import { buildLaunchctlRun } from '../../test-utils/buildLaunchctlRun.ts';
import { uninstallAgent } from '../uninstallAgent.ts';

const { homeDir } = vi.hoisted(() => ({ homeDir: { path: '' } }));

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: () => homeDir.path,
}));
vi.mock('../../launchctl/runLaunchctl.ts', () => ({ runLaunchctl: vi.fn() }));

const label = 'dev.example.agent';

describe(uninstallAgent, () => {
  beforeEach(async () => {
    homeDir.path = await mkdtemp(path.join(tmpdir(), 'launchd-agent-'));
  });

  afterEach(async () => {
    await rm(homeDir.path, { force: true, recursive: true });
  });

  it('reports a loaded agent and removes its plist', async () => {
    const plistPath = await writePlist();
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(0));

    await expect(uninstallAgent(label)).resolves.toStrictEqual({ wasLoaded: true });
    await expect(stat(plistPath)).rejects.toThrow('ENOENT');
  });

  it('reports an agent that launchd did not hold and still removes its plist', async () => {
    const plistPath = await writePlist();
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(113, 'Could not find service'));

    await expect(uninstallAgent(label)).resolves.toStrictEqual({ wasLoaded: false });
    await expect(stat(plistPath)).rejects.toThrow('ENOENT');
  });

  it('rejects and keeps the plist when the bootout fails while launchd still holds the agent', async () => {
    const plistPath = await writePlist();
    vi.mocked(runLaunchctl).mockImplementation(([subcommand]) =>
      Promise.resolve(
        subcommand === 'bootout'
          ? buildLaunchctlRun(5, 'Boot-out failed: 5: Input/output error\n')
          : buildLaunchctlRun(0, 'state = running'),
      ),
    );

    await expect(uninstallAgent(label)).rejects.toThrow('Boot-out failed: 5: Input/output error');
    await expect(stat(plistPath)).resolves.toBeDefined();
  });

  it('succeeds when the plist is already gone', async () => {
    vi.mocked(runLaunchctl).mockResolvedValue(buildLaunchctlRun(113));

    await expect(uninstallAgent(label)).resolves.toStrictEqual({ wasLoaded: false });
  });
});

// region | Helpers

/** Writes a placeholder plist for the agent under the temporary home. */
async function writePlist(): Promise<string> {
  const agentsDir = path.join(homeDir.path, 'Library/LaunchAgents');
  await mkdir(agentsDir, { recursive: true });
  const plistPath = path.join(agentsDir, `${label}.plist`);
  await writeFile(plistPath, '<plist/>');

  return plistPath;
}

// endregion | Helpers
