import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyKit } from '../src/types.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockFormatJsonError = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());

vi.mock('../src/config.ts', () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock('../src/runRdy.ts', () => ({
  meetsThreshold: (severity: string, threshold: string) => {
    const rank: Record<string, number> = { error: 0, warn: 1, recommend: 2 };
    const severityRank = rank[severity];
    const thresholdRank = rank[threshold];
    if (severityRank === undefined || thresholdRank === undefined) {
      throw new Error(`Invalid severity in meetsThreshold mock: severity="${severity}", threshold="${threshold}"`);
    }
    return severityRank <= thresholdRank;
  },
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

vi.mock('../src/loadRemoteKit.ts', () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

import { parseRunArgs, resolveKitSource, runCommand } from '../src/cli.ts';

function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'deploy', checks: [{ name: 'a', check: () => true }] },
      { name: 'infra', checks: [{ name: 'b', check: () => true }] },
    ],
    ...overrides,
  };
}

describe(parseRunArgs, () => {
  it('returns undefined source flags when no flags are given', () => {
    const result = parseRunArgs([]);

    expect(result.kitName).toBeUndefined();
    expect(result.filePath).toBeUndefined();
    expect(result.githubValue).toBeUndefined();
    expect(result.localValue).toBeUndefined();
    expect(result.urlValue).toBeUndefined();
    expect(result.json).toBe(false);
  });

  it('parses positional names', () => {
    const result = parseRunArgs(['deploy', 'infra']);

    expect(result.names).toStrictEqual(['deploy', 'infra']);
  });

  // --kit flag
  it('parses --kit flag', () => {
    const result = parseRunArgs(['--kit', 'deploy']);

    expect(result.kitName).toBe('deploy');
  });

  it('parses --kit with a slash-separated path', () => {
    const result = parseRunArgs(['--kit', 'shared/deploy']);

    expect(result.kitName).toBe('shared/deploy');
  });

  it('parses --kit= syntax', () => {
    const result = parseRunArgs(['--kit=deploy']);

    expect(result.kitName).toBe('deploy');
  });

  // --file flag
  it('parses --file flag', () => {
    const result = parseRunArgs(['--file', 'custom/path.ts']);

    expect(result.filePath).toBe('custom/path.ts');
    expect(result.names).toStrictEqual([]);
  });

  it('parses --file= syntax', () => {
    const result = parseRunArgs(['--file=custom/path.ts']);

    expect(result.filePath).toBe('custom/path.ts');
  });

  it('throws when --file has no value', () => {
    expect(() => parseRunArgs(['--file'])).toThrow('--file requires a path argument');
  });

  it('throws when --file= has an empty value', () => {
    expect(() => parseRunArgs(['--file='])).toThrow('--file requires a path argument');
  });

  // --json flag
  it('parses --json flag', () => {
    const result = parseRunArgs(['--json']);

    expect(result.json).toBe(true);
    expect(result.names).toStrictEqual([]);
  });

  it('parses --json with positional names', () => {
    const result = parseRunArgs(['--json', 'deploy']);

    expect(result.json).toBe(true);
    expect(result.names).toStrictEqual(['deploy']);
  });

  it('throws on unknown flags', () => {
    expect(() => parseRunArgs(['--unknown'])).toThrow("unknown flag '--unknown'");
  });

  // --config is no longer supported
  it('rejects --config as an unknown flag', () => {
    expect(() => parseRunArgs(['--config', 'x'])).toThrow("unknown flag '--config'");
  });

  // Short options
  it('parses -c as short form of --kit', () => {
    const result = parseRunArgs(['-k', 'deploy']);

    expect(result.kitName).toBe('deploy');
  });

  it('parses -f as short form of --file', () => {
    const result = parseRunArgs(['-f', 'custom/path.ts']);

    expect(result.filePath).toBe('custom/path.ts');
  });

  it('parses -g as short form of --github', () => {
    const result = parseRunArgs(['-g', 'org/repo']);

    expect(result.githubValue).toBe('org/repo');
  });

  it('parses -u as short form of --url', () => {
    const result = parseRunArgs(['-u', 'https://example.com/config.js']);

    expect(result.urlValue).toBe('https://example.com/config.js');
  });

  it('parses -j as short form of --json', () => {
    const result = parseRunArgs(['-j']);

    expect(result.json).toBe(true);
  });

  it('parses -F as short form of --fail-on', () => {
    const result = parseRunArgs(['-F', 'warn']);

    expect(result.failOn).toBe('warn');
  });

  it('parses -R as short form of --report-on', () => {
    const result = parseRunArgs(['-R', 'error']);

    expect(result.reportOn).toBe('error');
  });

  // --github flag
  it('parses --github with ref', () => {
    const result = parseRunArgs(['--github', 'org/repo@v1']);

    expect(result.githubValue).toBe('org/repo@v1');
  });

  it('parses --github= syntax', () => {
    const result = parseRunArgs(['--github=org/repo']);

    expect(result.githubValue).toBe('org/repo');
  });

  it('throws when --github has no value', () => {
    expect(() => parseRunArgs(['--github'])).toThrow('--github requires a repository argument');
  });

  it('throws when --github= has an empty value', () => {
    expect(() => parseRunArgs(['--github='])).toThrow('--github requires a repository argument');
  });

  it('throws when --kit has no value', () => {
    expect(() => parseRunArgs(['--kit'])).toThrow('--kit requires a kit name');
  });

  // --url flag
  it('parses --url flag with space-separated value', () => {
    const result = parseRunArgs(['--url', 'https://example.com/config.js']);

    expect(result.urlValue).toBe('https://example.com/config.js');
  });

  it('parses --url= syntax', () => {
    const result = parseRunArgs(['--url=https://example.com/config.js']);

    expect(result.urlValue).toBe('https://example.com/config.js');
  });

  it('throws when --url has no value', () => {
    expect(() => parseRunArgs(['--url'])).toThrow('--url requires a URL argument');
  });

  it('throws when --url= has an empty value', () => {
    expect(() => parseRunArgs(['--url='])).toThrow('--url requires a URL argument');
  });

  // --local flag
  it('parses --local flag', () => {
    const result = parseRunArgs(['--local', '/path/to/repo']);

    expect(result.localValue).toBe('/path/to/repo');
  });

  it('parses -l as short form of --local', () => {
    const result = parseRunArgs(['-l', '/path/to/repo']);

    expect(result.localValue).toBe('/path/to/repo');
  });

  it('throws when --local has no value', () => {
    expect(() => parseRunArgs(['--local'])).toThrow('--local requires a path to a local repository');
  });

  // Mutual exclusivity
  it('throws when --file and --github are combined', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', '--github', 'org/repo'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  it('throws when --github and --file are combined (reverse order)', () => {
    expect(() => parseRunArgs(['--github', 'org/repo', '--file', 'path.ts'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  it('throws when --file and --url are combined', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', '--url', 'https://example.com/config.js'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  it('throws when a flag name is passed as value to another flag', () => {
    expect(() => parseRunArgs(['--github', '--url'])).toThrow('--github requires a repository argument');
    expect(() => parseRunArgs(['--url', '--github'])).toThrow('--url requires a URL argument');
    expect(() => parseRunArgs(['--file', '--github'])).toThrow('--file requires a path argument');
  });

  it('throws when --github and --url are combined', () => {
    expect(() => parseRunArgs(['--github', 'org/repo', '--url', 'https://example.com/config.js'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  it('throws when --local and --file are combined', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', '--local', '/other/repo'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  it('throws when --local and --url are combined', () => {
    expect(() => parseRunArgs(['--local', '/other/repo', '--url', 'https://example.com/config.js'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  it('throws when --github and --local are combined', () => {
    expect(() => parseRunArgs(['--github', 'org/repo', '--local', '/path'])).toThrow(
      'Cannot combine --file, --github, --local, and --url flags',
    );
  });

  // --fail-on flag
  it('parses --fail-on with valid severity', () => {
    const result = parseRunArgs(['--fail-on', 'warn']);

    expect(result.failOn).toBe('warn');
  });

  it('parses --fail-on= syntax', () => {
    const result = parseRunArgs(['--fail-on=recommend']);

    expect(result.failOn).toBe('recommend');
  });

  it('throws when --fail-on has an invalid value', () => {
    expect(() => parseRunArgs(['--fail-on', 'critical'])).toThrow(
      '--fail-on must be one of: error, warn, recommend (got "critical")',
    );
  });

  it('throws when --fail-on has no value', () => {
    expect(() => parseRunArgs(['--fail-on'])).toThrow('--fail-on requires a severity level');
  });

  // --report-on flag
  it('parses --report-on with valid severity', () => {
    const result = parseRunArgs(['--report-on', 'error']);

    expect(result.reportOn).toBe('error');
  });

  it('parses --report-on= syntax', () => {
    const result = parseRunArgs(['--report-on=warn']);

    expect(result.reportOn).toBe('warn');
  });

  it('throws when --report-on has an invalid value', () => {
    expect(() => parseRunArgs(['--report-on', 'debug'])).toThrow(
      '--report-on must be one of: error, warn, recommend (got "debug")',
    );
  });

  it('throws when --report-on has no value', () => {
    expect(() => parseRunArgs(['--report-on'])).toThrow('--report-on requires a severity level');
  });

  it('omits failOn and reportOn when not specified', () => {
    const result = parseRunArgs([]);

    expect(result).not.toHaveProperty('failOn');
    expect(result).not.toHaveProperty('reportOn');
  });
});

describe(resolveKitSource, () => {
  /** Build args with defaults for internal config. */
  function resolve(overrides: Partial<Parameters<typeof resolveKitSource>[0]> = {}) {
    return resolveKitSource({
      filePath: undefined,
      githubValue: undefined,
      localValue: undefined,
      urlValue: undefined,
      kitName: undefined,
      internalDir: '.',
      internalExtension: '.ts',
      ...overrides,
    });
  }

  it('resolves default kit path with default internal config', () => {
    expect(resolve()).toStrictEqual({ path: '.rdy/kits/default.ts' });
  });

  it('resolves named kit with default internal config', () => {
    expect(resolve({ kitName: 'deploy' })).toStrictEqual({ path: '.rdy/kits/deploy.ts' });
  });

  it('resolves slash-separated kit name', () => {
    expect(resolve({ kitName: 'shared/deploy' })).toStrictEqual({
      path: '.rdy/kits/shared/deploy.ts',
    });
  });

  it('applies custom internal dir and extension', () => {
    expect(resolve({ internalDir: 'internal', internalExtension: '.int.ts' })).toStrictEqual({
      path: '.rdy/kits/internal/default.int.ts',
    });
  });

  it('applies custom internal dir with named kit', () => {
    expect(resolve({ kitName: 'deploy', internalDir: 'internal', internalExtension: '.int.ts' })).toStrictEqual({
      path: '.rdy/kits/internal/deploy.int.ts',
    });
  });

  it('resolves --file to a path source', () => {
    expect(resolve({ filePath: 'custom/path.ts' })).toStrictEqual({ path: 'custom/path.ts' });
  });

  it('resolves --github without ref to a URL with main ref', () => {
    expect(resolve({ githubValue: 'org/repo', kitName: 'nmr' })).toStrictEqual({
      url: 'https://raw.githubusercontent.com/org/repo/main/.rdy/kits/nmr.js',
    });
  });

  it('resolves --github with ref to a URL with that ref', () => {
    expect(resolve({ githubValue: 'org/repo@v1', kitName: 'nmr' })).toStrictEqual({
      url: 'https://raw.githubusercontent.com/org/repo/v1/.rdy/kits/nmr.js',
    });
  });

  it('defaults --github kit to "default"', () => {
    expect(resolve({ githubValue: 'org/repo' })).toStrictEqual({
      url: 'https://raw.githubusercontent.com/org/repo/main/.rdy/kits/default.js',
    });
  });

  it('resolves --local to a .js path under .rdy/kits/', () => {
    expect(resolve({ localValue: '/path/to/repo' })).toStrictEqual({
      path: '/path/to/repo/.rdy/kits/default.js',
    });
  });

  it('resolves --local with --kit to a named .js file', () => {
    expect(resolve({ localValue: '/path/to/repo', kitName: 'deploy' })).toStrictEqual({
      path: '/path/to/repo/.rdy/kits/deploy.js',
    });
  });

  it('resolves --local with a relative path against cwd', () => {
    const expected = path.resolve(process.cwd(), '../sibling-repo');

    expect(resolve({ localValue: '../sibling-repo' })).toStrictEqual({
      path: `${expected}/.rdy/kits/default.js`,
    });
  });

  it('resolves --url to a URL source', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js' })).toStrictEqual({
      url: 'https://example.com/config.js',
    });
  });

  it('throws when --kit is combined with --file', () => {
    expect(() => resolve({ filePath: 'path.ts', kitName: 'deploy' })).toThrow('--kit cannot be used with --file');
  });

  it('throws when --kit is combined with --url', () => {
    expect(() => resolve({ urlValue: 'https://example.com/config.js', kitName: 'deploy' })).toThrow(
      '--kit cannot be used with --url',
    );
  });

  it('ignores internal config when --file is used', () => {
    expect(
      resolve({ filePath: 'custom/path.ts', internalDir: 'internal', internalExtension: '.int.ts' }),
    ).toStrictEqual({
      path: 'custom/path.ts',
    });
  });

  it('ignores internal config when --github is used', () => {
    expect(resolve({ githubValue: 'org/repo', internalDir: 'internal', internalExtension: '.int.ts' })).toStrictEqual({
      url: 'https://raw.githubusercontent.com/org/repo/main/.rdy/kits/default.js',
    });
  });

  it('ignores internal config when --local is used', () => {
    expect(
      resolve({ localValue: '/path/to/repo', internalDir: 'internal', internalExtension: '.int.ts' }),
    ).toStrictEqual({
      path: '/path/to/repo/.rdy/kits/default.js',
    });
  });

  it('ignores internal config when --url is used', () => {
    expect(
      resolve({ urlValue: 'https://example.com/config.js', internalDir: 'internal', internalExtension: '.int.ts' }),
    ).toStrictEqual({
      url: 'https://example.com/config.js',
    });
  });
});

describe(runCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReportRdy.mockReturnValue('report output');
    mockFormatCombinedSummary.mockReturnValue('combined summary');
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
    mockLoadRemoteKit.mockReset();
  });

  it('runs all checklists when no names are given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockRunRdy).toHaveBeenCalledTimes(2);
    expect(exitCode).toBe(0);
  });

  it('filters to named checklists only', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      names: ['deploy'],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockRunRdy).toHaveBeenCalledTimes(1);
    expect(mockRunRdy).toHaveBeenCalledWith(
      kit.checklists[0],
      expect.objectContaining({ defaultSeverity: 'error', failOn: 'error' }),
    );
    expect(exitCode).toBe(0);
  });

  it('errors when an unknown checklist name is given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);

    const exitCode = await runCommand({
      names: ['nonexistent'],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown name(s): nonexistent'));
    expect(exitCode).toBe(1);
  });

  it('returns exit code 1 when any checklist fails', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const exitCode = await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(exitCode).toBe(1);
  });

  it('passes kit path to local kit loader', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: [],
      kitSource: { path: 'custom/path.ts' },
      json: false,
    });

    expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts');
  });

  it('shows headers when running multiple checklists', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('--- deploy ---');
    expect(allOutput).toContain('--- infra ---');
  });

  it('does not show headers for a single checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: ['deploy'],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('---');
  });

  it('uses per-checklist fixLocation over kit default', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }], fixLocation: 'inline' }],
    });
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'inline' }));
  });

  it('falls back to kit-level fixLocation when checklist has none', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'end' }));
  });

  it('reports kit loading errors to stderr', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

    const exitCode = await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith('Error: Kit not found\n');
    expect(exitCode).toBe(1);
  });

  it('prints combined summary when multiple checklists run', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({
      results: [
        {
          name: 'a',
          status: 'passed',
          ok: true,
          severity: 'error',
          detail: null,
          fix: null,
          error: null,
          progress: null,
          durationMs: 10,
        },
      ],
      passed: true,
      durationMs: 10,
    });

    await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(mockFormatCombinedSummary).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'deploy',
        passed: 1,
        errors: 0,
        warnings: 0,
        recommendations: 0,
        blocked: 0,
        optional: 0,
        worstSeverity: null,
      }),
      expect.objectContaining({
        name: 'infra',
        passed: 1,
        errors: 0,
        warnings: 0,
        recommendations: 0,
        blocked: 0,
        optional: 0,
        worstSeverity: null,
      }),
    ]);
  });

  it('does not print combined summary for a single checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: ['deploy'],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  it('includes failure counts in combined summary', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy
      .mockResolvedValueOnce({
        results: [
          {
            name: 'a',
            status: 'passed',
            ok: true,
            severity: 'error',
            detail: null,
            fix: null,
            error: null,
            progress: null,
            durationMs: 10,
          },
          {
            name: 'b',
            status: 'failed',
            ok: false,
            severity: 'error',
            detail: null,
            fix: null,
            error: null,
            progress: null,
            durationMs: 5,
          },
        ],
        passed: false,
        durationMs: 15,
      })
      .mockResolvedValueOnce({
        results: [
          {
            name: 'c',
            status: 'skipped',
            ok: null,
            severity: 'error',
            skipReason: 'precondition',
            detail: null,
            fix: null,
            error: null,
            progress: null,
            durationMs: 0,
          },
        ],
        passed: false,
        durationMs: 0,
      });

    await runCommand({
      names: [],
      kitSource: { path: '.rdy/kits/default.ts' },
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'deploy',
        passed: 1,
        errors: 1,
        warnings: 0,
        recommendations: 0,
        blocked: 0,
        optional: 0,
        worstSeverity: 'error',
      }),
      expect.objectContaining({
        name: 'infra',
        passed: 0,
        errors: 0,
        warnings: 0,
        recommendations: 0,
        blocked: 1,
        optional: 0,
        worstSeverity: null,
      }),
    ]);
  });

  describe('threshold cascade', () => {
    it('uses CLI --fail-on flag over kit default', async () => {
      const kit = makeKit({ failOn: 'error' });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        names: ['deploy'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: false,
        failOn: 'warn',
      });

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'warn' }));
    });

    it('falls back to kit failOn when CLI flag is absent', async () => {
      const kit = makeKit({ failOn: 'recommend' });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        names: ['deploy'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: false,
      });

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });

    it('falls back to kit reportOn when CLI flag is absent', async () => {
      const kit = makeKit({ reportOn: 'warn' });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        names: ['deploy'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: false,
      });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });

    it('passes reportOn to reportRdy', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        names: ['deploy'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: false,
        reportOn: 'warn',
      });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });

    it('passes reportOn to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');

      await runCommand({
        names: ['deploy'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
        reportOn: 'error',
      });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reportOn: 'error' }),
      );
    });
  });

  describe('JSON mode', () => {
    beforeEach(() => {
      mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');
      mockFormatJsonError.mockReturnValue('{"error":"boom"}');
    });

    it('emits JSON output and no human-readable text', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const exitCode = await runCommand({
        names: [],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
      expect(mockReportRdy).not.toHaveBeenCalled();
      expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith('{"worstSeverity":null}\n');
      expect(exitCode).toBe(0);
    });

    it('returns exit code 1 when any checklist fails in JSON mode', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy
        .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
        .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

      const exitCode = await runCommand({
        names: [],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      expect(exitCode).toBe(1);
    });

    it('emits JSON error to stdout for kit loading errors', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

      const exitCode = await runCommand({
        names: [],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      expect(mockFormatJsonError).toHaveBeenCalledWith('Kit not found');
      expect(stdoutSpy).toHaveBeenCalledWith('{"error":"boom"}\n');
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    it('emits JSON error to stdout for unknown checklist names', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);

      const exitCode = await runCommand({
        names: ['nonexistent'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      expect(mockFormatJsonError).toHaveBeenCalledWith(expect.stringContaining('Unknown name(s): nonexistent'));
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    it('passes checklist name-report pairs to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      const report1 = { results: [], passed: true, durationMs: 10 };
      const report2 = { results: [], passed: true, durationMs: 20 };
      mockRunRdy.mockResolvedValueOnce(report1).mockResolvedValueOnce(report2);

      await runCommand({
        names: [],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [
          { name: 'deploy', report: report1 },
          { name: 'infra', report: report2 },
        ],
        expect.objectContaining({ reportOn: 'recommend' }),
      );
    });

    it('emits JSON error to stdout when runRdy throws', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockRejectedValue(new Error('runner crashed'));

      const exitCode = await runCommand({
        names: ['deploy'],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      expect(mockFormatJsonError).toHaveBeenCalledWith('runner crashed');
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    it('does not write headers in JSON mode', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        names: [],
        kitSource: { path: '.rdy/kits/default.ts' },
        json: true,
      });

      const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).not.toContain('---');
    });
  });

  // GitHub source tests (via URL with raw.githubusercontent.com)
  it('resolves token for GitHub raw URLs', async () => {
    const kit = makeKit();
    mockResolveGitHubToken.mockReturnValue('token-abc');
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      names: [],
      kitSource: { url: 'https://raw.githubusercontent.com/org/repo/main/.rdy/kits/nmr.js' },
      json: false,
    });

    expect(mockResolveGitHubToken).toHaveBeenCalled();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/org/repo/main/.rdy/kits/nmr.js',
      token: 'token-abc',
    });
    expect(exitCode).toBe(0);
  });

  it('omits token when resolveGitHubToken returns undefined for GitHub URLs', async () => {
    const kit = makeKit();
    mockResolveGitHubToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      names: [],
      kitSource: { url: 'https://raw.githubusercontent.com/org/repo/v2/.rdy/kits/nmr.js' },
      json: false,
    });

    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/org/repo/v2/.rdy/kits/nmr.js',
    });
    expect(mockLoadRemoteKit.mock.calls[0][0]).not.toHaveProperty('token');
  });

  // URL source tests
  it('fetches directly for non-GitHub URL source without token resolution', async () => {
    const kit = makeKit();
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      names: [],
      kitSource: { url: 'https://example.com/config.js' },
      json: false,
    });

    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://example.com/config.js',
    });
    expect(exitCode).toBe(0);
  });

  it('reports remote kit loading errors to stderr', async () => {
    mockLoadRemoteKit.mockRejectedValue(new Error('Failed to fetch remote kit'));

    const exitCode = await runCommand({
      names: [],
      kitSource: { url: 'https://example.com/config.js' },
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith('Error: Failed to fetch remote kit\n');
    expect(exitCode).toBe(1);
  });
});
