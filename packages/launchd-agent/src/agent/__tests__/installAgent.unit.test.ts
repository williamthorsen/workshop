import type { Stats } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveHomebrewBin } from '../../homebrew/resolveHomebrewBin.ts';
import { type AgentSpec, renderPlist } from '../../plist/renderPlist.ts';
import { installAgent } from '../installAgent.ts';
import { readAgentState } from '../readAgentState.ts';
import { replaceLoadedAgent } from '../replaceLoadedAgent.ts';

const { homeDir } = vi.hoisted(() => ({ homeDir: { path: '' } }));

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: () => homeDir.path,
}));
vi.mock('../../homebrew/resolveHomebrewBin.ts', () => ({ resolveHomebrewBin: vi.fn() }));
vi.mock('../readAgentState.ts', () => ({ readAgentState: vi.fn() }));
vi.mock('../replaceLoadedAgent.ts', () => ({ replaceLoadedAgent: vi.fn() }));

const HOMEBREW_BIN = '/opt/homebrew/bin';
const LOADED = { lastExitCode: undefined, loaded: true, pid: 123 } as const;

describe(installAgent, () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    homeDir.path = await mkdtemp(path.join(tmpdir(), 'launchd-agent-'));
    vi.mocked(resolveHomebrewBin).mockResolvedValue(HOMEBREW_BIN);
    vi.mocked(readAgentState).mockResolvedValue({ loaded: false });
  });

  afterEach(async () => {
    await rm(homeDir.path, { force: true, recursive: true });
  });

  it('writes the plist to LaunchAgents, replaces the loaded agent with it, and reports a change', async () => {
    const spec = buildSpec();

    const { changed, plistPath } = await installAgent(spec);

    expect(changed).toBe(true);
    expect(plistPath).toBe(findTestPlistPath());
    await expect(readFile(plistPath, 'utf8')).resolves.toContain('/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(replaceLoadedAgent).toHaveBeenCalledWith(spec.label, plistPath);
  });

  it('creates the log directory', async () => {
    const spec = buildSpec();

    await installAgent(spec);

    await expect(stat(spec.logDir)).resolves.toSatisfy((stats: Stats) => stats.isDirectory());
  });

  it('leaves a loaded agent whose plist matches untouched and reports no change', async () => {
    const spec = buildSpec();
    const plistPath = await writeExistingPlist(renderPlist(spec, { homebrewBin: HOMEBREW_BIN }));
    vi.mocked(readAgentState).mockResolvedValue(LOADED);

    await expect(installAgent(spec)).resolves.toStrictEqual({ changed: false, plistPath });

    expect(replaceLoadedAgent).not.toHaveBeenCalled();
    await expect(stat(plistPath)).resolves.toSatisfy((stats: Stats) => stats.mtimeMs === 0);
  });

  it('loads an agent whose plist matches but that launchd does not hold, without rewriting the plist', async () => {
    const spec = buildSpec();
    const plistPath = await writeExistingPlist(renderPlist(spec, { homebrewBin: HOMEBREW_BIN }));

    await expect(installAgent(spec)).resolves.toStrictEqual({ changed: true, plistPath });

    expect(replaceLoadedAgent).toHaveBeenCalledWith(spec.label, plistPath);
    await expect(stat(plistPath)).resolves.toSatisfy((stats: Stats) => stats.mtimeMs === 0);
  });

  it('rewrites and replaces a loaded agent whose plist differs', async () => {
    const spec = buildSpec();
    const plistPath = await writeExistingPlist(renderPlist(spec, { homebrewBin: '/usr/local/bin' }));
    vi.mocked(readAgentState).mockResolvedValue(LOADED);

    await expect(installAgent(spec)).resolves.toStrictEqual({ changed: true, plistPath });

    await expect(readFile(plistPath, 'utf8')).resolves.toBe(renderPlist(spec, { homebrewBin: HOMEBREW_BIN }));
    expect(replaceLoadedAgent).toHaveBeenCalledWith(spec.label, plistPath);
    expect(readAgentState).not.toHaveBeenCalled();
  });

  it('removes a written plist when the replacement fails, so that the next install retries it', async () => {
    const spec = buildSpec();
    await writeExistingPlist(renderPlist(spec, { homebrewBin: '/usr/local/bin' }));
    vi.mocked(readAgentState).mockResolvedValue(LOADED);
    vi.mocked(replaceLoadedAgent).mockRejectedValueOnce(new Error('launchd still held dev.example.agent'));

    await expect(installAgent(spec)).rejects.toThrow('launchd still held');
    await expect(stat(findTestPlistPath())).rejects.toThrow('ENOENT');

    await expect(installAgent(spec)).resolves.toStrictEqual({ changed: true, plistPath: findTestPlistPath() });
    expect(replaceLoadedAgent).toHaveBeenCalledTimes(2);
  });

  it('keeps a matching plist when loading the agent fails', async () => {
    const spec = buildSpec();
    const plistPath = await writeExistingPlist(renderPlist(spec, { homebrewBin: HOMEBREW_BIN }));
    vi.mocked(replaceLoadedAgent).mockRejectedValueOnce(new Error('launchctl bootstrap failed'));

    await expect(installAgent(spec)).rejects.toThrow('launchctl bootstrap failed');
    await expect(stat(plistPath)).resolves.toSatisfy((stats: Stats) => stats.mtimeMs === 0);
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

/** Returns where `installAgent` writes the default spec's plist under the temporary home. */
function findTestPlistPath(): string {
  return path.join(homeDir.path, 'Library/LaunchAgents/dev.example.agent.plist');
}

/** Writes a plist as though an earlier install left it, with its mtime at the epoch so that a rewrite shows. */
async function writeExistingPlist(contents: string): Promise<string> {
  const plistPath = findTestPlistPath();
  await mkdir(path.dirname(plistPath), { recursive: true });
  await writeFile(plistPath, contents);
  await utimes(plistPath, 0, 0);
  return plistPath;
}

// endregion | Helpers
