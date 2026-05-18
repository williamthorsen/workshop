import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyKit } from '../src/types.ts';

const { RUNNER_VERSION } = vi.hoisted(() => ({ RUNNER_VERSION: '0.21.0' }));

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockFormatJsonError = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());

vi.mock('../src/config.ts', () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock('../src/runRdy.ts', () => ({
  meetsThreshold: () => true,
  runRdy: mockRunRdy,
}));

vi.mock('../src/reportRdy.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/reportRdy.ts')>('../src/reportRdy.ts');
  return {
    ...actual,
    reportRdy: mockReportRdy,
  };
});

vi.mock('../src/formatCombinedSummary.ts', () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock('../src/formatJsonReport.ts', () => ({
  formatJsonReport: mockFormatJsonReport,
}));

vi.mock('../src/formatJsonError.ts', () => ({
  formatJsonError: mockFormatJsonError,
}));

vi.mock('../src/resolveGitHubToken.ts', () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock('../src/resolveBitbucketToken.ts', () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock('../src/loadRemoteKit.ts', () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

vi.mock('../src/version.ts', () => ({
  VERSION: RUNNER_VERSION,
}));

import { runCommand } from '../src/cli.ts';

/** Build a minimal kit with one passing checklist. */
function makeKit(): RdyKit {
  return {
    checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
  };
}

/** Build a single-kit entry pointing at a fixture-style local path. */
function singleKitEntry(name = 'default') {
  return [{ name, source: { path: '.readyup/kits/default.js' }, checklists: [] }];
}

describe('version-skew warning', () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReportRdy.mockReturnValue('report output');
    mockFormatCombinedSummary.mockReturnValue('');
    mockFormatJsonReport.mockReturnValue('{}');
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockFormatJsonReport.mockReset();
    mockFormatJsonError.mockReset();
    mockResolveGitHubToken.mockReset();
    mockResolveBitbucketToken.mockReset();
    mockLoadRemoteKit.mockReset();
  });

  /** Concatenate every stderr write into a single string for substring assertions. */
  function stderrText(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  /** Concatenate every stdout write into a single string for substring assertions. */
  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  it('emits "rdy compile" advice on stderr when runner is newer above the boundary', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.20.0' });

    const exitCode = await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(exitCode).toBe(0);
    const stderr = stderrText();
    expect(stderr).toContain('Warning: kit "default" was compiled against readyup 0.20.0; runner is 0.21.0.');
    expect(stderr).toContain('Run `rdy compile` to refresh.');
  });

  it('emits "upgrade readyup" advice on stderr when runner is older above the boundary', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.22.0' });

    const exitCode = await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(exitCode).toBe(0);
    const stderr = stderrText();
    expect(stderr).toContain('Warning: kit "default" was compiled against readyup 0.22.0; runner is 0.21.0.');
    expect(stderr).toContain('Upgrade readyup to match.');
  });

  it('stays silent when versions differ only below the leftmost-non-zero boundary', async () => {
    // RUNNER_VERSION is 0.21.0; compile-time 0.21.5 has same boundary segment.
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.21.5' });

    await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(stderrText()).not.toContain('Warning:');
  });

  it('stays silent when compile-time and runner versions are identical', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: RUNNER_VERSION });

    await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(stderrText()).not.toContain('Warning:');
  });

  it('stays silent when compile-time version is absent (back-compat)', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

    await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(stderrText()).not.toContain('Warning:');
  });

  it('stays silent when compile-time version is unparseable (defensive)', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: 'not-a-version' });

    await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(stderrText()).not.toContain('Warning:');
  });

  it('does not alter the exit code regardless of skew direction', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.20.0' });

    const exitCode = await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(exitCode).toBe(0);
  });

  it('emits the warning to stderr in JSON mode without polluting stdout JSON', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.20.0' });
    mockFormatJsonReport.mockReturnValue('{"kits":[]}');

    await runCommand({ kitEntries: singleKitEntry('default'), json: true });

    expect(stderrText()).toContain('Warning:');
    // stdout should contain only the JSON report (and a trailing newline).
    expect(stdoutText()).toBe('{"kits":[]}\n');
  });

  it('uses the entry display name (URL) in the warning for --url sources', async () => {
    mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.20.0' });
    const url = 'https://example.com/kits/deploy.js';

    await runCommand({
      kitEntries: [{ name: url, source: { url }, checklists: [] }],
      json: false,
    });

    expect(stderrText()).toContain(`Warning: kit "${url}" was compiled against readyup 0.20.0`);
  });

  it('stays silent when --url kit omits __readyupVersion (third-party tolerance)', async () => {
    mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

    await runCommand({
      kitEntries: [
        { name: 'https://example.com/kits/x.js', source: { url: 'https://example.com/kits/x.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(stderrText()).not.toContain('Warning:');
  });

  it('scopes the warning to the skewing kit when running multiple kits in human mode', async () => {
    // First kit has skew (compile-time 0.20.0 vs runner 0.21.0); second kit has no compile-time version.
    mockLoadRdyKit
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: '0.20.0' })
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });

    await runCommand({
      kitEntries: [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: [] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: [] },
      ],
      json: false,
    });

    const stderr = stderrText();
    expect(stderr).toContain('Warning: kit "alpha" was compiled against readyup 0.20.0');
    expect(stderr).not.toContain('kit "beta"');
  });

  it('scopes the warning to the skewing kit when running multiple kits in JSON mode', async () => {
    mockLoadRdyKit
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: '0.20.0' })
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
    mockFormatJsonReport.mockReturnValue('{"kits":[]}');

    await runCommand({
      kitEntries: [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: [] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: [] },
      ],
      json: true,
    });

    const stderr = stderrText();
    expect(stderr).toContain('Warning: kit "alpha" was compiled against readyup 0.20.0');
    expect(stderr).not.toContain('kit "beta"');
  });

  it('emits the warning before any checklist runs', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '0.20.0' });
    const order: string[] = [];
    stderrSpy.mockImplementation((chunk: unknown) => {
      const text = String(chunk);
      if (text.includes('Warning:')) order.push('warning');
      return true;
    });
    mockRunRdy.mockImplementation(() => {
      order.push('run');
      return Promise.resolve({ results: [], passed: true, durationMs: 0 });
    });

    await runCommand({ kitEntries: singleKitEntry('default'), json: false });

    expect(order[0]).toBe('warning');
    expect(order).toContain('run');
  });
});
