import type { Stats } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveHomebrewBin } from '../../homebrew/resolveHomebrewBin.ts';
import type { AgentSpec } from '../../plist/renderPlist.ts';
import { installAgent } from '../installAgent.ts';
import { replaceLoadedAgent } from '../replaceLoadedAgent.ts';

const { homeDir } = vi.hoisted(() => ({ homeDir: { path: '' } }));

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: () => homeDir.path,
}));
vi.mock('../../homebrew/resolveHomebrewBin.ts', () => ({ resolveHomebrewBin: vi.fn() }));
vi.mock('../replaceLoadedAgent.ts', () => ({ replaceLoadedAgent: vi.fn() }));

describe(installAgent, () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    homeDir.path = await mkdtemp(path.join(tmpdir(), 'launchd-agent-'));
    vi.mocked(resolveHomebrewBin).mockResolvedValue('/opt/homebrew/bin');
  });

  afterEach(async () => {
    await rm(homeDir.path, { force: true, recursive: true });
  });

  it('writes the plist to LaunchAgents and replaces the loaded agent with it', async () => {
    const spec = buildSpec();

    const plistPath = await installAgent(spec);

    expect(plistPath).toBe(path.join(homeDir.path, 'Library/LaunchAgents/dev.example.agent.plist'));
    await expect(readFile(plistPath, 'utf8')).resolves.toContain('/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(replaceLoadedAgent).toHaveBeenCalledWith(spec.label, plistPath);
  });

  it('creates the log directory', async () => {
    const spec = buildSpec();

    await installAgent(spec);

    await expect(stat(spec.logDir)).resolves.toSatisfy((stats: Stats) => stats.isDirectory());
  });

  it.each(['', 'dev/example'])('rejects the label %j without writing or loading anything', async (label) => {
    await expect(installAgent(buildSpec({ label }))).rejects.toThrow('Invalid agent label');
    expect(replaceLoadedAgent).not.toHaveBeenCalled();
    await expect(stat(path.join(homeDir.path, 'Library/LaunchAgents'))).rejects.toThrow('ENOENT');
  });

  it.each([[[]], [['bin/example.js']]])(
    'rejects the program arguments %j without writing or loading anything',
    async (programArguments) => {
      await expect(installAgent(buildSpec({ programArguments }))).rejects.toThrow('Invalid program');
      expect(replaceLoadedAgent).not.toHaveBeenCalled();
    },
  );
});

// region | Helpers

/** Builds a spec whose log directory lies under the temporary home. */
function buildSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    label: 'dev.example.agent',
    logDir: path.join(homeDir.path, 'Library/Logs/example'),
    programArguments: ['/usr/local/bin/node', '/repos/example/bin/example.js'],
    trigger: { keepAlive: true },
    ...overrides,
  };
}

// endregion | Helpers
